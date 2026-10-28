package com.pmd.goldpassport.idempotency.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.FilterChain;

class IdempotencyFilterTest {

    private final Instant now = Instant.parse("2026-10-28T10:00:00Z");
    private final InMemoryStore store = new InMemoryStore();
    private final IdempotencyFilter filter = new IdempotencyFilter(store,
            new IdempotencyProperties(Duration.ofMinutes(10), Duration.ofDays(30)),
            Clock.fixed(now, ZoneOffset.UTC), new ObjectMapper());
    private final AtomicInteger executions = new AtomicInteger();

    @BeforeEach
    void signIn() {
        signInAs("user-1");
    }

    @AfterEach
    void signOut() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void repeatedKeyReplaysTheFirstSuccessWithoutRunningAgain() throws Exception {
        FilterChain created = respond(201, "{\"id\":\"photo-1\"}");

        MockHttpServletResponse first = run(post("/api/v1/lots/1/photos", "k-1"), created);
        MockHttpServletResponse second = run(post("/api/v1/lots/1/photos", "k-1"), created);

        assertThat(executions).hasValue(1);
        assertThat(first.getStatus()).isEqualTo(201);
        assertThat(first.getHeader(IdempotencyFilter.REPLAYED_HEADER)).isNull();
        assertThat(second.getStatus()).isEqualTo(201);
        assertThat(second.getContentAsString()).isEqualTo("{\"id\":\"photo-1\"}");
        assertThat(second.getContentType()).startsWith("application/json");
        assertThat(second.getHeader(IdempotencyFilter.REPLAYED_HEADER)).isEqualTo("true");
    }

    @Test
    void failuresAreNotRememberedSoARetryRunsAgain() throws Exception {
        MockHttpServletResponse failed = run(post("/api/v1/transports/1/depart", "k-2"), respond(503, "{}"));
        MockHttpServletResponse retried = run(post("/api/v1/transports/1/depart", "k-2"), respond(200, "{\"ok\":true}"));

        assertThat(failed.getStatus()).isEqualTo(503);
        assertThat(retried.getStatus()).isEqualTo(200);
        assertThat(retried.getHeader(IdempotencyFilter.REPLAYED_HEADER)).isNull();
        assertThat(executions).hasValue(2);
    }

    @Test
    void anExceptionReleasesTheKey() throws Exception {
        FilterChain boom = (req, res) -> {
            executions.incrementAndGet();
            throw new IllegalStateException("boom");
        };
        assertThatThrownBy(() -> run(post("/api/v1/transports/1/depart", "k-3"), boom))
                .isInstanceOf(IllegalStateException.class);

        assertThat(run(post("/api/v1/transports/1/depart", "k-3"), respond(200, "{}")).getStatus()).isEqualTo(200);
        assertThat(executions).hasValue(2);
    }

    @Test
    void aRepeatWhileTheFirstAttemptRunsIsAskedToRetryLater() throws Exception {
        store.begin("user-1", "k-4", "POST /api/v1/transports/1/pickup", now.minusSeconds(30), now.minusSeconds(600));

        MockHttpServletResponse response = run(post("/api/v1/transports/1/pickup", "k-4"), respond(200, "{}"));

        assertThat(executions).hasValue(0);
        assertThat(response.getStatus()).isEqualTo(409);
        assertThat(response.getHeader("Retry-After")).isEqualTo("5");
        assertThat(response.getContentAsString()).contains("\"code\":\"IDEMPOTENCY_KEY_IN_USE\"");
    }

    @Test
    void aStaleAttemptIsTakenOver() throws Exception {
        store.begin("user-1", "k-5", "POST /api/v1/transports/1/pickup", now.minus(Duration.ofHours(1)), now);

        assertThat(run(post("/api/v1/transports/1/pickup", "k-5"), respond(200, "{}")).getStatus()).isEqualTo(200);
        assertThat(executions).hasValue(1);
    }

    @Test
    void reusingAKeyForAnotherOperationIsRejected() throws Exception {
        run(post("/api/v1/transports/1/depart", "k-6"), respond(200, "{}"));

        MockHttpServletResponse response = run(post("/api/v1/transports/1/pickup", "k-6"), respond(200, "{}"));

        assertThat(response.getStatus()).isEqualTo(422);
        assertThat(response.getContentAsString()).contains("\"code\":\"IDEMPOTENCY_KEY_REUSED\"");
        assertThat(executions).hasValue(1);
    }

    @Test
    void keysAreScopedToTheCaller() throws Exception {
        run(post("/api/v1/lots/1/photos", "same"), respond(201, "{\"by\":1}"));
        signInAs("user-2");

        MockHttpServletResponse other = run(post("/api/v1/lots/1/photos", "same"), respond(201, "{\"by\":2}"));

        assertThat(other.getContentAsString()).isEqualTo("{\"by\":2}");
        assertThat(executions).hasValue(2);
    }

    @Test
    void invalidKeysAreRejected() throws Exception {
        MockHttpServletResponse response = run(post("/api/v1/lots/1/photos", "bad key!"), respond(201, "{}"));

        assertThat(response.getStatus()).isEqualTo(400);
        assertThat(response.getContentAsString()).contains("\"code\":\"IDEMPOTENCY_KEY_INVALID\"");
        assertThat(executions).hasValue(0);
    }

    @Test
    void requestsWithoutKeyOrCallerAreUntouched() throws Exception {
        run(post("/api/v1/lots/1/photos", null), respond(201, "{}"));
        run(post("/api/v1/lots/1/photos", null), respond(201, "{}"));
        SecurityContextHolder.clearContext();
        run(post("/api/v1/auth/otp/request", "k-7"), respond(200, "{}"));
        run(post("/api/v1/auth/otp/request", "k-7"), respond(200, "{}"));

        assertThat(executions).hasValue(4);
        assertThat(store.rows).isEmpty();
    }

    private void signInAs(String user) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(user, null, List.of()));
    }

    private static MockHttpServletRequest post(String uri, String key) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", uri);
        if (key != null) {
            request.addHeader(IdempotencyFilter.HEADER, key);
        }
        return request;
    }

    private MockHttpServletResponse run(MockHttpServletRequest request, FilterChain chain) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, chain);
        return response;
    }

    private FilterChain respond(int status, String body) {
        return (req, res) -> {
            executions.incrementAndGet();
            var http = (jakarta.servlet.http.HttpServletResponse) res;
            http.setStatus(status);
            http.setContentType("application/json");
            http.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
        };
    }

    /** Same semantics as {@link JdbcIdempotencyStore}, in memory. */
    private static final class InMemoryStore implements IdempotencyStore {

        private record Row(String fingerprint, boolean completed, int status, String contentType, byte[] body,
                Instant updatedAt) {
        }

        final Map<String, Row> rows = new HashMap<>();

        @Override
        public Outcome begin(String owner, String key, String fingerprint, Instant now, Instant staleBefore) {
            String id = owner + "/" + key;
            Row row = rows.get(id);
            if (row == null) {
                rows.put(id, new Row(fingerprint, false, 0, null, null, now));
                return new Started();
            }
            if (!row.fingerprint().equals(fingerprint)) {
                return new Mismatch();
            }
            if (row.completed()) {
                return new Replay(row.status(), row.contentType(), row.body());
            }
            if (row.updatedAt().isBefore(staleBefore)) {
                rows.put(id, new Row(fingerprint, false, 0, null, null, now));
                return new Started();
            }
            return new InProgress();
        }

        @Override
        public void complete(String owner, String key, int status, String contentType, byte[] body, Instant now) {
            String id = owner + "/" + key;
            rows.put(id, new Row(rows.get(id).fingerprint(), true, status, contentType, body, now));
        }

        @Override
        public void release(String owner, String key) {
            rows.computeIfPresent(owner + "/" + key, (k, row) -> row.completed() ? row : null);
        }

        @Override
        public int purge(Instant createdBefore) {
            return 0;
        }
    }
}
