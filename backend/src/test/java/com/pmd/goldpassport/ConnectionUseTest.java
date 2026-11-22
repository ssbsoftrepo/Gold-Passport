package com.pmd.goldpassport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pmd.goldpassport.notifications.push.PushGateway;
import com.pmd.goldpassport.onboarding.kyc.IdentityVerifier;
import com.pmd.goldpassport.storage.internal.ObjectStore;
import com.pmd.goldpassport.support.ApiClient;
import com.pmd.goldpassport.support.ApiClient.Response;
import com.pmd.goldpassport.support.PostgresIntegrationTest;

/**
 * Calls to S3, SNS and Rekognition must never run inside a database transaction: a transaction holds
 * one of the few pooled connections until it ends, so a slow AWS call there blocks other requests.
 * The adapters are wrapped to record whether a transaction was active on each call.
 *
 * <p>Also covers two races around onboarding: the KYC result must survive a reviewer approving
 * before the check finished, and an upload rejected after it was stored must not leave its bytes.
 */
@Import(ConnectionUseTest.RecordingAdapters.class)
class ConnectionUseTest extends PostgresIntegrationTest {

    record Call(String port, String method, boolean inTransaction) {
    }

    static final List<Call> CALLS = new CopyOnWriteArrayList<>();

    /** Wraps the AWS-facing ports in proxies that note whether a transaction is active on the calling thread. */
    @TestConfiguration
    static class RecordingAdapters {

        @Bean
        static BeanPostProcessor recordTransactionStateOfExternalCalls() {
            return new BeanPostProcessor() {
                @Override
                public Object postProcessAfterInitialization(Object bean, String name) {
                    for (Class<?> port : List.of(ObjectStore.class, PushGateway.class, IdentityVerifier.class)) {
                        if (port.isInstance(bean)) {
                            return Proxy.newProxyInstance(port.getClassLoader(), new Class<?>[] {port},
                                    (proxy, method, args) -> {
                                        CALLS.add(new Call(port.getSimpleName(), method.getName(),
                                                TransactionSynchronizationManager.isActualTransactionActive()));
                                        try {
                                            return method.invoke(bean, args);
                                        } catch (InvocationTargetException e) {
                                            throw e.getCause();
                                        }
                                    });
                        }
                    }
                    return bean;
                }
            };
        }
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    JdbcTemplate jdbc;

    @Value("${pmd.storage.local-dir}")
    Path storageDir;

    ApiClient api;

    @BeforeEach
    void setUp() {
        api = new ApiClient(mvc, objectMapper);
        CALLS.clear();
    }

    @Test
    void awsCallsRunOutsideTransactionsAndKycResultsSurviveAQuickApproval() throws Exception {
        String adminPhone = ApiClient.randomPhone();
        String admin = api.login(adminPhone);
        jdbc.update("update identity.users set role = 'ADMIN' where phone = ?", adminPhone);

        String miner = api.login(ApiClient.randomPhone());
        ok(api.post(miner, "/api/v1/devices", Map.of("token", "test-device-" + System.nanoTime(), "platform", "ANDROID")), 204);
        ok(api.put(miner, "/api/v1/me/role", Map.of("role", "MINER")), 200);
        ok(api.put(miner, "/api/v1/onboarding/me", Map.of(
                "fullName", "Rosa Quispe", "documentType", "DNI", "documentNumber", ApiClient.randomDni(),
                "email", "rosa@example.pe")), 200);
        ok(api.upload(miner, "/api/v1/onboarding/me/documents", "dni.jpg", "image/jpeg", ApiClient.JPEG,
                Map.of("kind", "ID_DOCUMENT")), 201);
        ok(api.upload(miner, "/api/v1/onboarding/me/documents", "selfie.jpg", "image/jpeg", ApiClient.JPEG,
                Map.of("kind", "SELFIE")), 201);
        String applicationId = ok(api.post(miner, "/api/v1/onboarding/me/submit", null), 200).body().get("id").asText();

        // The reviewer approves at once, typically before the asynchronous KYC check has finished.
        ok(api.post(admin, "/api/v1/admin/onboarding/{id}/approve", Map.of(), applicationId), 200);

        await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> assertThat(CALLS)
                .extracting(Call::port, Call::method)
                .contains(
                        org.assertj.core.groups.Tuple.tuple("PushGateway", "register"),
                        org.assertj.core.groups.Tuple.tuple("ObjectStore", "put"),
                        org.assertj.core.groups.Tuple.tuple("ObjectStore", "get"),
                        org.assertj.core.groups.Tuple.tuple("IdentityVerifier", "verify"),
                        org.assertj.core.groups.Tuple.tuple("PushGateway", "send")));

        assertThat(CALLS).as("AWS calls made while holding a database transaction")
                .filteredOn(Call::inTransaction).isEmpty();

        // The KYC result is not overwritten by the approval (the stub always answers NEEDS_REVIEW).
        await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> assertThat(jdbc.queryForObject(
                "select kyc_status from onboarding.applications where id = ?::uuid", String.class, applicationId))
                .isEqualTo("NEEDS_REVIEW"));
    }

    @Test
    void uploadsRefusedAfterTheirBytesWereStoredLeaveNothingBehind() throws Exception {
        String adminPhone = ApiClient.randomPhone();
        String admin = api.login(adminPhone);
        jdbc.update("update identity.users set role = 'ADMIN' where phone = ?", adminPhone);
        String miner = api.login(ApiClient.randomPhone());
        ok(api.put(miner, "/api/v1/me/role", Map.of("role", "MINER")), 200);
        ok(api.put(miner, "/api/v1/onboarding/me", Map.of(
                "fullName", "Rosa Quispe", "documentType", "DNI", "documentNumber", ApiClient.randomDni(),
                "email", "rosa@example.pe")), 200);
        ok(api.upload(miner, "/api/v1/onboarding/me/documents", "dni.jpg", "image/jpeg", ApiClient.JPEG,
                Map.of("kind", "ID_DOCUMENT")), 201);
        ok(api.upload(miner, "/api/v1/onboarding/me/documents", "selfie.jpg", "image/jpeg", ApiClient.JPEG,
                Map.of("kind", "SELFIE")), 201);
        String applicationId = ok(api.post(miner, "/api/v1/onboarding/me/submit", null), 200).body().get("id").asText();
        ok(api.post(admin, "/api/v1/admin/onboarding/{id}/approve", Map.of(), applicationId), 200);
        String lotId = ok(api.post(miner, "/api/v1/lots", Map.of("mineSiteName", "Socavon 1")), 201)
                .body().get("id").asText();
        long filesBefore = countStoredFiles();

        // Only known once the bytes are stored and sniffed: a PDF is not an extraction photo.
        Response notAPhoto = api.upload(miner, "/api/v1/lots/{id}/photos", "report.pdf", "application/pdf",
                ApiClient.PDF, Map.of("latitude", "-14.83", "longitude", "-74.93"), lotId);
        // Only known inside the transaction: the application was submitted and can no longer change.
        Response notEditable = api.upload(miner, "/api/v1/onboarding/me/documents", "late.jpg", "image/jpeg",
                ApiClient.JPEG, Map.of("kind", "SELFIE"));

        assertThat(notAPhoto.status()).as("body: %s", notAPhoto.body()).isEqualTo(400);
        assertThat(notAPhoto.body().get("code").asText()).isEqualTo("PHOTO_REQUIRED");
        assertThat(notEditable.status()).as("body: %s", notEditable.body()).isEqualTo(409);
        assertThat(countStoredFiles()).as("files left in storage").isEqualTo(filesBefore);
    }

    private long countStoredFiles() throws IOException {
        if (!Files.exists(storageDir)) {
            return 0;
        }
        try (Stream<Path> files = Files.walk(storageDir)) {
            return files.filter(Files::isRegularFile).count();
        }
    }

    private static Response ok(Response r, int status) {
        assertThat(r.status()).as("HTTP status, body: %s", r.body()).isEqualTo(status);
        return r;
    }
}
