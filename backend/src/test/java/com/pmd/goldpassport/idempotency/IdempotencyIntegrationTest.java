package com.pmd.goldpassport.idempotency;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pmd.goldpassport.support.ApiClient;
import com.pmd.goldpassport.support.ApiClient.Response;
import com.pmd.goldpassport.support.PostgresIntegrationTest;

/**
 * The offline outbox repeats an upload whose answer was lost on a weak signal: with the same
 * Idempotency-Key the file is stored once and the repeat gets the first answer.
 */
class IdempotencyIntegrationTest extends PostgresIntegrationTest {

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
    void aRepeatedUploadWithTheSameKeyIsStoredOnce() throws Exception {
        String miner = api.login(ApiClient.randomPhone());
        assertThat(api.put(miner, "/api/v1/me/role", Map.of("role", "MINER")).status()).isEqualTo(200);
        assertThat(api.put(miner, "/api/v1/onboarding/me", Map.of(
                "fullName", "Rosa Quispe", "documentType", "DNI", "documentNumber", ApiClient.randomDni()))
                .status()).isEqualTo(200);
        String minerId = api.get(miner, "/api/v1/me").body().get("id").asText();

        Response first = upload(miner, "outbox-item-1");
        Response repeat = upload(miner, "outbox-item-1");

        assertThat(first.status()).as("body: %s", first.body()).isEqualTo(201);
        assertThat(repeat.status()).isEqualTo(201);
        assertThat(repeat.body()).isEqualTo(first.body());
        assertThat(storedFiles(minerId)).isEqualTo(1);

        Response another = upload(miner, "outbox-item-2");
        assertThat(another.status()).isEqualTo(201);
        assertThat(another.body().get("id")).isNotEqualTo(first.body().get("id"));
        assertThat(storedFiles(minerId)).isEqualTo(2);
    }

    private Response upload(String token, String key) throws Exception {
        return api.uploadIdempotent(key, token, "/api/v1/onboarding/me/documents", "dni.jpg", "image/jpeg",
                ApiClient.JPEG, Map.of("kind", "ID_DOCUMENT"));
    }

    private int storedFiles(String userId) {
        return jdbc.queryForObject("select count(*) from storage.files where uploaded_by = ?::uuid", Integer.class,
                userId);
    }
}
