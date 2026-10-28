package com.pmd.goldpassport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.pmd.goldpassport.support.ApiClient;
import com.pmd.goldpassport.support.ApiClient.Response;
import com.pmd.goldpassport.support.PostgresIntegrationTest;

/**
 * The whole business flow from the four diagrams, through the public API:
 * onboarding (Miner, Transporter, Collector) -> relationships -> lote with GPS evidence ->
 * transport with double confirmation and custody hand-offs -> collector lab check ->
 * payment negotiation validated by PMD -> verifiable gold passport.
 */
class EndToEndFlowTest extends PostgresIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    JdbcTemplate jdbc;

    ApiClient api;

    @BeforeEach
    void setUp() {
        api = new ApiClient(mvc, objectMapper);
    }

    @Test
    void goldTravelsFromMinerToCollectorWithAVerifiableChainOfCustody() throws Exception {
        // ------------------------------------------------------------ PMD back office user
        String adminPhone = ApiClient.randomPhone();
        String admin = api.login(adminPhone);
        jdbc.update("update identity.users set role = 'ADMIN' where phone = ?", adminPhone);

        // ------------------------------------------------------------ Miner onboarding
        String minerPhone = ApiClient.randomPhone();
        String miner = api.login(minerPhone);
        String minerDni = ApiClient.randomDni();
        ok(api.put(miner, "/api/v1/me/role", Map.of("role", "MINER")));
        Response draft = ok(api.get(miner, "/api/v1/onboarding/me"));
        assertThat(draft.body().get("status").asString()).isEqualTo("DRAFT");
        assertThat(draft.body().get("missingRequirements")).isNotEmpty();
        ok(api.put(miner, "/api/v1/onboarding/me", Map.of(
                "fullName", "Rosa Quispe", "documentType", "DNI", "documentNumber", minerDni,
                "email", "rosa@example.pe")));
        // Submitting without documents is refused with the list of what is missing.
        assertThat(api.post(miner, "/api/v1/onboarding/me/submit", null).status()).isEqualTo(422);
        created(api.upload(miner, "/api/v1/onboarding/me/documents", "dni.jpg", "image/jpeg", ApiClient.JPEG,
                Map.of("kind", "ID_DOCUMENT")));
        created(api.upload(miner, "/api/v1/onboarding/me/documents", "selfie.jpg", "image/jpeg", ApiClient.JPEG,
                Map.of("kind", "SELFIE")));
        String minerApp = ok(api.post(miner, "/api/v1/onboarding/me/submit", null)).body().get("id").asString();

        // Not approved yet: cannot create lots.
        assertThat(api.post(miner, "/api/v1/lots", Map.of("mineSiteName", "Socavon 1")).status()).isEqualTo(403);
        ok(api.post(admin, "/api/v1/admin/onboarding/{id}/approve", Map.of("notes", "DNI verified"), minerApp));
        String minerId = ok(api.get(miner, "/api/v1/me")).body().get("id").asString();

        // ------------------------------------------------------------ Transporter onboarding
        String transporterPhone = ApiClient.randomPhone();
        String transporter = api.login(transporterPhone);
        ok(api.put(transporter, "/api/v1/me/role", Map.of("role", "TRANSPORTER")));
        ok(api.put(transporter, "/api/v1/onboarding/me", Map.of(
                "fullName", "Jorge Mamani", "documentType", "DNI", "documentNumber", ApiClient.randomDni(),
                "driverLicenseNumber", "Q12345678", "vehiclePlate", "abc-123")));
        created(api.upload(transporter, "/api/v1/onboarding/me/documents", "dni.jpg", "image/jpeg", ApiClient.JPEG,
                Map.of("kind", "ID_DOCUMENT")));
        created(api.upload(transporter, "/api/v1/onboarding/me/documents", "license.pdf", "application/pdf", ApiClient.PDF,
                Map.of("kind", "DRIVER_LICENSE")));
        String transporterApp = ok(api.post(transporter, "/api/v1/onboarding/me/submit", null)).body().get("id").asString();
        // PMD first asks for a correction, the transporter resubmits, then PMD approves.
        ok(api.post(admin, "/api/v1/admin/onboarding/{id}/request-corrections",
                Map.of("notes", "License photo is blurry"), transporterApp));
        created(api.upload(transporter, "/api/v1/onboarding/me/documents", "license2.pdf", "application/pdf",
                ApiClient.PDF, Map.of("kind", "DRIVER_LICENSE")));
        ok(api.post(transporter, "/api/v1/onboarding/me/submit", null));
        ok(api.post(admin, "/api/v1/admin/onboarding/{id}/approve", Map.of(), transporterApp));

        // ------------------------------------------------------------ Collector/Plant onboarding
        String collectorPhone = ApiClient.randomPhone();
        String collector = api.login(collectorPhone);
        String ruc = ApiClient.randomRuc();
        ok(api.put(collector, "/api/v1/me/role", Map.of("role", "COLLECTOR")));
        ok(api.put(collector, "/api/v1/onboarding/me", Map.of(
                "companyName", "Planta Aurifera Sur SAC", "ruc", ruc, "companyAddress", "Av. Industrial 123, Nazca",
                "legalRepresentative", "Carmen Rojas")));
        created(api.upload(collector, "/api/v1/onboarding/me/documents", "vigencia.pdf", "application/pdf",
                ApiClient.PDF, Map.of("kind", "COMPANY_LEGAL_DOCUMENT")));
        String collectorApp = ok(api.post(collector, "/api/v1/onboarding/me/submit", null)).body().get("id").asString();
        ok(api.post(admin, "/api/v1/admin/onboarding/{id}/approve", Map.of(), collectorApp));
        String collectorId = ok(api.get(collector, "/api/v1/me")).body().get("id").asString();

        // ------------------------------------------------------------ Commercial relationships
        Response relMiner = created(api.post(transporter, "/api/v1/relationships", Map.of(
                "counterpartyRole", "MINER", "entityName", "Rosa Quispe", "documentType", "DNI",
                "documentNumber", minerDni, "phone", minerPhone, "contactPerson", "Rosa")));
        assertThat(relMiner.body().get("status").asString()).isEqualTo("PENDING_REVIEW");
        assertThat(relMiner.body().get("counterpartyUserId").asString()).isEqualTo(minerId);
        Response relCollector = created(api.post(transporter, "/api/v1/relationships", Map.of(
                "counterpartyRole", "COLLECTOR", "entityName", "Planta Aurifera Sur SAC", "documentType", "RUC",
                "documentNumber", ruc)));

        // Without approved relationships, no transport can be requested.
        assertThat(api.post(transporter, "/api/v1/transports",
                Map.of("minerUserId", minerId, "collectorUserId", collectorId)).status()).isEqualTo(422);

        ok(api.post(admin, "/api/v1/admin/relationships/{id}/approve", Map.of(), relMiner.body().get("id").asString()));
        ok(api.post(admin, "/api/v1/admin/relationships/{id}/approve", Map.of(), relCollector.body().get("id").asString()));

        // ------------------------------------------------------------ Lote with GPS evidence
        Response lot = created(api.post(miner, "/api/v1/lots", Map.of("mineSiteName", "Socavon San Juan")));
        String lotId = lot.body().get("id").asString();
        String lotCode = lot.body().get("code").asString();
        assertThat(lotCode).startsWith("GP-");
        // Completing without photos is refused.
        assertThat(api.post(miner, "/api/v1/lots/{id}/complete", null, lotId).status()).isEqualTo(422);
        Response evidence = created(api.upload(miner, "/api/v1/lots/{id}/photos", "extraction.jpg", "image/jpeg",
                ApiClient.JPEG, Map.of("latitude", "-14.8309", "longitude", "-74.9389", "accuracyMeters", "8",
                        "capturedAt", "2026-10-20T14:30:00Z"), lotId));
        assertThat(evidence.body().get("sha256").asString()).hasSize(64);
        ok(api.post(miner, "/api/v1/lots/{id}/complete", null, lotId));
        Response ready = ok(api.upload(miner, "/api/v1/lots/{id}/miner-lab-result", "assay.pdf", "application/pdf",
                ApiClient.PDF, Map.of("purityPct", "92.5", "weightGrams", "150", "labName", "Lab Minero Nazca"), lotId));
        assertThat(ready.body().get("status").asString()).isEqualTo("READY_FOR_TRANSPORT");

        // Other participants cannot see the lot yet.
        assertThat(api.get(collector, "/api/v1/lots/{id}", lotId).status()).isEqualTo(403);

        // ------------------------------------------------------------ Transport request + double confirmation
        Response transport = created(api.post(transporter, "/api/v1/transports",
                Map.of("minerUserId", minerId, "collectorUserId", collectorId, "plannedPickupDate", "2026-10-22")));
        String transportId = transport.body().get("id").asString();
        assertThat(transport.body().get("status").asString()).isEqualTo("PENDING_CONFIRMATION");

        // The collector declines first; the transporter amends ("resolve pending confirmation").
        ok(api.post(collector, "/api/v1/transports/{id}/decline", Map.of("reason", "Plant closed that day"), transportId));
        ok(api.put(transporter, "/api/v1/transports/{id}",
                Map.of("minerUserId", minerId, "collectorUserId", collectorId, "plannedPickupDate", "2026-10-23"),
                transportId));

        ok(api.post(miner, "/api/v1/transports/{id}/miner-confirm", Map.of("lotId", lotId), transportId));
        Response confirmed = ok(api.post(collector, "/api/v1/transports/{id}/collector-confirm", null, transportId));
        assertThat(confirmed.body().get("status").asString()).isEqualTo("CONFIRMED");
        assertThat(confirmed.body().get("lotCode").asString()).isEqualTo(lotCode);

        // ------------------------------------------------------------ Journey and custody hand-offs
        Map<String, Object> atMine = Map.of("latitude", -14.8312, "longitude", -74.9391, "accuracyMeters", 10);
        ok(api.post(transporter, "/api/v1/transports/{id}/depart", Map.of("latitude", -14.70, "longitude", -75.13), transportId));
        Response arrived = ok(api.post(transporter, "/api/v1/transports/{id}/arrive-at-miner", atMine, transportId));
        assertThat(arrived.body().get("locationMismatch").asBoolean()).isFalse();
        assertThat(arrived.body().get("arrivalDistanceKm").asDouble()).isLessThan(1.0);

        // Pickup needs both the collector's approval and the miner's handover.
        assertThat(api.post(transporter, "/api/v1/transports/{id}/pickup", atMine, transportId).status()).isEqualTo(409);
        ok(api.post(collector, "/api/v1/transports/{id}/approve-pickup", null, transportId));
        ok(api.post(miner, "/api/v1/transports/{id}/handover", null, transportId));
        ok(api.post(transporter, "/api/v1/transports/{id}/pickup", atMine, transportId));
        JsonNode inTransit = ok(api.get(transporter, "/api/v1/lots/{id}", lotId)).body();
        assertThat(inTransit.get("status").asString()).isEqualTo("IN_TRANSIT");
        assertThat(inTransit.get("custodianRole").asString()).isEqualTo("TRANSPORTER");

        ok(api.post(transporter, "/api/v1/transports/{id}/location", Map.of("latitude", -14.5, "longitude", -75.0), transportId));
        ok(api.post(transporter, "/api/v1/transports/{id}/arrive-at-collector",
                Map.of("latitude", -14.84, "longitude", -74.95), transportId));
        ok(api.post(collector, "/api/v1/transports/{id}/receive", null, transportId));
        Response done = ok(api.post(transporter, "/api/v1/transports/{id}/finalize", null, transportId));
        assertThat(done.body().get("status").asString()).isEqualTo("COMPLETED");
        assertThat(done.body().get("checkpoints")).hasSize(5);

        JsonNode delivered = ok(api.get(collector, "/api/v1/lots/{id}", lotId)).body();
        assertThat(delivered.get("status").asString()).isEqualTo("DELIVERED");
        assertThat(delivered.get("custodianRole").asString()).isEqualTo("COLLECTOR");

        // ------------------------------------------------------------ Collector lab check
        Response lab = created(api.upload(collector, "/api/v1/lots/{id}/lab-result", "plant-assay.pdf",
                "application/pdf", ApiClient.PDF,
                Map.of("purityPct", "92.3", "weightGrams", "149.5", "labName", "Laboratorio Planta Sur"), lotId));
        assertThat(lab.body().get("status").asString()).isEqualTo("APPROVED");
        assertThat(ok(api.get(miner, "/api/v1/lots/{id}", lotId)).body().get("status").asString()).isEqualTo("LAB_APPROVED");

        // ------------------------------------------------------------ Payment negotiation
        ok(api.post(collector, "/api/v1/lots/{id}/settlement/proposals",
                Map.of("amount", 30000, "currency", "PEN", "pricePerGram", 200.67), lotId));
        ok(api.post(miner, "/api/v1/lots/{id}/settlement/dispute", Map.of("reason", "Below market price"), lotId));
        ok(api.post(collector, "/api/v1/lots/{id}/settlement/proposals",
                Map.of("amount", 31500, "currency", "PEN"), lotId));
        ok(api.post(miner, "/api/v1/lots/{id}/settlement/accept", null, lotId));
        // Payment cannot be recorded before PMD validates the amount.
        assertThat(api.post(collector, "/api/v1/lots/{id}/settlement/mark-paid",
                Map.of("paymentReference", "OP-1", "paymentMethod", "BANK_TRANSFER"), lotId).status()).isEqualTo(409);
        ok(api.post(admin, "/api/v1/admin/lots/{id}/settlement/validate", Map.of("notes", "Both parties confirmed by phone"), lotId));
        Response paid = ok(api.post(collector, "/api/v1/lots/{id}/settlement/mark-paid",
                Map.of("paymentReference", "OP-778899", "paymentMethod", "BANK_TRANSFER"), lotId));
        assertThat(paid.body().get("status").asString()).isEqualTo("PAID");
        assertThat(paid.body().get("proposals")).hasSize(2);
        assertThat(ok(api.get(miner, "/api/v1/lots/{id}", lotId)).body().get("status").asString()).isEqualTo("SETTLED");

        // ------------------------------------------------------------ Gold passport
        JsonNode ledger = ok(api.get(miner, "/api/v1/lots/{id}/ledger", lotId)).body();
        assertThat(ledger.get("verified").asBoolean()).isTrue();
        assertThat(ledger.get("entries").size()).isGreaterThan(20);

        Response publicPassport = api.get(null, "/api/v1/public/passports/{code}", lotCode);
        assertThat(publicPassport.status()).isEqualTo(200);
        assertThat(publicPassport.body().get("ledgerVerified").asBoolean()).isTrue();
        assertThat(publicPassport.body().get("status").asString()).isEqualTo("SETTLED");
        assertThat(publicPassport.body().toString())
                .as("public passport must not leak names or phone numbers")
                .doesNotContain("Rosa").doesNotContain(minerPhone).doesNotContain("Planta");

        // ------------------------------------------------------------ Notifications (async)
        await().atMost(Duration.ofSeconds(15)).untilAsserted(() ->
                assertThat(ok(api.get(miner, "/api/v1/notifications")).body().size()).isGreaterThan(3));

        // ------------------------------------------------------------ Tamper evidence
        assertThatThrownBy(() -> jdbc.update(
                "update audit.ledger_entries set payload = '{}' where chain_key = ?", "lot:" + lotId))
                .as("the database refuses edits to the ledger")
                .hasMessageContaining("append-only");
        jdbc.execute("alter table audit.ledger_entries disable trigger ledger_append_only");
        try {
            jdbc.update("update audit.ledger_entries set payload = '{\"forged\":true}' where chain_key = ? and sequence = 2",
                    "lot:" + lotId);
            assertThat(ok(api.get(admin, "/api/v1/lots/{id}/ledger", lotId)).body().get("verified").asBoolean())
                    .as("a forged entry is detected by the hash chain")
                    .isFalse();
        } finally {
            jdbc.execute("alter table audit.ledger_entries enable trigger ledger_append_only");
        }
    }

    @Test
    void protectedEndpointsRequireAuthenticationAndRoles() throws Exception {
        assertThat(api.get(null, "/api/v1/me").status()).isEqualTo(401);
        String someone = api.login(ApiClient.randomPhone());
        assertThat(api.get(someone, "/api/v1/admin/onboarding").status()).isEqualTo(403);
        assertThat(api.put(someone, "/api/v1/me/role", Map.of("role", "ADMIN")).status()).isEqualTo(409);
        assertThat(api.get(null, "/api/v1/auth/config").body().get("mode").asString()).isEqualTo("local");
    }

    @Test
    void wrongOtpIsRejected() throws Exception {
        String phone = ApiClient.randomPhone();
        api.post(null, "/api/v1/auth/otp/request", Map.of("phone", phone));
        Response r = api.post(null, "/api/v1/auth/otp/verify", Map.of("phone", phone, "code", "000001"));
        assertThat(r.status()).isEqualTo(401);
        assertThat(r.body().get("code").asString()).isEqualTo("OTP_INVALID");
    }

    private static Response ok(Response r) {
        assertThat(r.status()).as("HTTP status, body: %s", r.body()).isEqualTo(200);
        return r;
    }

    private static Response created(Response r) {
        assertThat(r.status()).as("HTTP status, body: %s", r.body()).isEqualTo(201);
        return r;
    }
}
