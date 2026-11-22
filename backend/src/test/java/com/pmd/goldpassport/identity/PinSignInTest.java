package com.pmd.goldpassport.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.pmd.goldpassport.support.ApiClient;
import com.pmd.goldpassport.support.ApiClient.Response;
import com.pmd.goldpassport.support.PostgresIntegrationTest;

import tools.jackson.databind.ObjectMapper;

/** Phone number + PIN sign-in (local mode), PMD resets and staff passwords, through the API. */
@TestPropertySource(properties = {"pmd.auth.local.max-attempts=3", "pmd.auth.local.lockout=10m"})
class PinSignInTest extends PostgresIntegrationTest {

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

    private Response signUp(String phone, String pin) throws Exception {
        return api.post(null, "/api/v1/auth/pin/sign-up", Map.of("phone", phone, "pin", pin));
    }

    private Response signIn(String phone, String pin) throws Exception {
        return api.post(null, "/api/v1/auth/pin/sign-in", Map.of("phone", phone, "pin", pin));
    }

    private static String code(Response r) {
        return r.body().get("code").asString();
    }

    @Test
    void signsUpAndInWithAPinAndNoSms() throws Exception {
        String phone = ApiClient.randomPhone();
        Response created = signUp(phone, "482915");
        assertThat(created.status()).isEqualTo(201);
        assertThat(created.body().get("user").get("phone").asString()).isEqualTo(phone);

        Response in = signIn(phone, "482915");
        assertThat(in.status()).isEqualTo(200);
        String token = in.body().get("accessToken").asString();
        assertThat(api.get(token, "/api/v1/me").body().get("phone").asString()).isEqualTo(phone);

        assertThat(code(signUp(phone, "591824"))).isEqualTo("PHONE_ALREADY_REGISTERED");
        // The PIN is stored only as a BCrypt hash.
        String hash = jdbc.queryForObject("select c.secret_hash from identity.local_credentials c "
                + "join identity.users u on u.id = c.user_id where u.phone = ?", String.class, phone);
        assertThat(hash).startsWith("$2").doesNotContain("482915");
    }

    @Test
    void refusesPinsThatAreEasyToGuess() throws Exception {
        for (String pin : new String[] {"123456", "654321", "000000", "777777", "12345", "1234567", "12a456"}) {
            Response r = signUp(ApiClient.randomPhone(), pin);
            assertThat(r.status()).as(pin).isEqualTo(400);
            assertThat(code(r)).as(pin).isEqualTo("PIN_NOT_ALLOWED");
        }
    }

    @Test
    void wrongPinOrUnknownPhoneLooksTheSameAndLocksTheAccountAfterRepeatedTries() throws Exception {
        assertThat(code(signIn(ApiClient.randomPhone(), "482915"))).isEqualTo("INVALID_CREDENTIALS");

        String phone = ApiClient.randomPhone();
        signUp(phone, "482915");
        assertThat(code(signIn(phone, "111112"))).isEqualTo("INVALID_CREDENTIALS");
        assertThat(code(signIn(phone, "111113"))).isEqualTo("INVALID_CREDENTIALS");
        assertThat(code(signIn(phone, "111114"))).isEqualTo("INVALID_CREDENTIALS"); // 3rd: locks
        Response locked = signIn(phone, "482915");
        assertThat(locked.status()).isEqualTo(429);
        assertThat(code(locked)).isEqualTo("TOO_MANY_ATTEMPTS");
    }

    @Test
    void pmdResetsAForgottenPinWithATemporaryOneThatMustBeReplaced() throws Exception {
        String admin = admin();
        String phone = ApiClient.randomPhone();
        signUp(phone, "482915");
        String userId = signIn(phone, "482915").body().get("user").get("id").asString();

        Response reset = api.post(admin, "/api/v1/admin/users/{id}/reset-pin", null, userId);
        assertThat(reset.status()).as("body: %s", reset.body()).isEqualTo(200);
        String temporary = reset.body().get("temporaryPin").asString();
        assertThat(temporary).matches("\\d{6}");
        assertThat(reset.body().get("expiresAt").asString()).isNotBlank();

        assertThat(code(signIn(phone, "482915"))).isEqualTo("INVALID_CREDENTIALS"); // old PIN gone
        assertThat(code(signIn(phone, temporary))).isEqualTo("PIN_CHANGE_REQUIRED");
        Response same = api.post(null, "/api/v1/auth/pin/new",
                Map.of("phone", phone, "temporaryPin", temporary, "newPin", temporary));
        assertThat(code(same)).isEqualTo("PIN_NOT_ALLOWED");
        Response replaced = api.post(null, "/api/v1/auth/pin/new",
                Map.of("phone", phone, "temporaryPin", temporary, "newPin", "730164"));
        assertThat(replaced.status()).as("body: %s", replaced.body()).isEqualTo(200);
        assertThat(signIn(phone, "730164").status()).isEqualTo(200);
        assertThat(code(signIn(phone, temporary))).isEqualTo("INVALID_CREDENTIALS");
    }

    @Test
    void onlyPmdResetsPinsAndNotTheirOwn() throws Exception {
        String someone = api.login(ApiClient.randomPhone());
        String otherId = api.get(api.login(ApiClient.randomPhone()), "/api/v1/me").body().get("id").asString();
        assertThat(api.post(someone, "/api/v1/admin/users/{id}/reset-pin", null, otherId).status()).isEqualTo(403);

        String admin = admin();
        String adminId = api.get(admin, "/api/v1/me").body().get("id").asString();
        Response own = api.post(admin, "/api/v1/admin/users/{id}/reset-pin", null, adminId);
        assertThat(code(own)).isEqualTo("CANNOT_RESET_OWN_PIN");
    }

    @Test
    void peopleChangeTheirPinAfterConfirmingTheCurrentOne() throws Exception {
        String phone = ApiClient.randomPhone();
        String token = signUp(phone, "482915").body().get("accessToken").asString();
        Response wrong = api.put(token, "/api/v1/me/pin", Map.of("currentPin", "111112", "newPin", "730164"));
        assertThat(code(wrong)).isEqualTo("INVALID_CREDENTIALS");
        Response easy = api.put(token, "/api/v1/me/pin", Map.of("currentPin", "482915", "newPin", "111111"));
        assertThat(code(easy)).isEqualTo("PIN_NOT_ALLOWED");
        assertThat(api.put(token, "/api/v1/me/pin", Map.of("currentPin", "482915", "newPin", "730164")).status())
                .isEqualTo(204);
        assertThat(signIn(phone, "730164").status()).isEqualTo(200);
    }

    @Test
    void pmdStaffUseAPasswordOfAtLeastTenCharacters() throws Exception {
        String adminPhone = ApiClient.randomPhone();
        String admin = admin(adminPhone);
        Response pin = api.put(admin, "/api/v1/me/pin", Map.of("currentPin", ApiClient.TEST_PIN, "newPin", "730164"));
        assertThat(code(pin)).isEqualTo("PASSWORD_TOO_SHORT");
        assertThat(api.put(admin, "/api/v1/me/pin",
                Map.of("currentPin", ApiClient.TEST_PIN, "newPin", "oro-seguro-2026")).status()).isEqualTo(204);
        assertThat(signIn(adminPhone, "oro-seguro-2026").status()).isEqualTo(200);

        // A reset staff account gets a long temporary password, not a PIN.
        String otherAdminPhone = ApiClient.randomPhone();
        admin(otherAdminPhone);
        String otherAdminId = signIn(otherAdminPhone, ApiClient.TEST_PIN).body().get("user").get("id").asString();
        String temporary = api.post(admin, "/api/v1/admin/users/{id}/reset-pin", null, otherAdminId)
                .body().get("temporaryPin").asString();
        assertThat(temporary).hasSize(12);
    }

    private String admin() throws Exception {
        return admin(ApiClient.randomPhone());
    }

    private String admin(String phone) throws Exception {
        api.login(phone);
        jdbc.update("update identity.users set role = 'ADMIN' where phone = ?", phone);
        return api.login(phone);
    }
}
