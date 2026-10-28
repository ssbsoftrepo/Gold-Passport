package com.pmd.goldpassport.idempotency.internal;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * {@link IdempotencyStore} on {@code idempotency.request_keys}. The primary key (owner, key) makes
 * claiming atomic: of two concurrent attempts with the same key only one insert succeeds.
 */
@Repository
class JdbcIdempotencyStore implements IdempotencyStore {

    private static final String PENDING = "PENDING";
    private static final String COMPLETED = "COMPLETED";

    private final JdbcTemplate jdbc;

    JdbcIdempotencyStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private record Row(String fingerprint, String state, Integer status, String contentType, byte[] body) {
    }

    @Override
    public Outcome begin(String owner, String key, String fingerprint, Instant now, Instant staleBefore) {
        // A few rounds cover a key released by a failed attempt between our insert and select.
        for (int round = 0; round < 3; round++) {
            UUID attemptId = UUID.randomUUID();
            int inserted = jdbc.update("""
                    insert into idempotency.request_keys
                        (owner, idem_key, fingerprint, state, attempt_id, created_at, updated_at)
                    values (?, ?, ?, ?, ?, ?, ?)
                    on conflict (owner, idem_key) do nothing""",
                    owner, key, fingerprint, PENDING, attemptId, utc(now), utc(now));
            if (inserted == 1) {
                return new Started(attemptId);
            }
            List<Row> rows = jdbc.query("""
                    select fingerprint, state, response_status, response_content_type, response_body
                    from idempotency.request_keys where owner = ? and idem_key = ?""",
                    (rs, i) -> new Row(rs.getString(1), rs.getString(2), (Integer) rs.getObject(3), rs.getString(4),
                            rs.getBytes(5)),
                    owner, key);
            if (rows.isEmpty()) {
                continue;
            }
            Row row = rows.get(0);
            if (!row.fingerprint().equals(fingerprint)) {
                return new Mismatch();
            }
            if (COMPLETED.equals(row.state())) {
                return new Replay(row.status(), row.contentType(), row.body() == null ? new byte[0] : row.body());
            }
            // Compare-and-set: only one retry takes over an attempt that has gone quiet.
            int takenOver = jdbc.update("""
                    update idempotency.request_keys set attempt_id = ?, updated_at = ?
                    where owner = ? and idem_key = ? and state = ? and updated_at < ?""",
                    attemptId, utc(now), owner, key, PENDING, utc(staleBefore));
            return takenOver == 1 ? new Started(attemptId) : new InProgress();
        }
        return new InProgress();
    }

    @Override
    public void complete(String owner, String key, UUID attemptId, int status, String contentType, byte[] body,
            Instant now) {
        jdbc.update("""
                update idempotency.request_keys
                set state = ?, response_status = ?, response_content_type = ?, response_body = ?, updated_at = ?
                where owner = ? and idem_key = ? and attempt_id = ? and state = ?""",
                COMPLETED, status, contentType, body, utc(now), owner, key, attemptId, PENDING);
    }

    @Override
    public void release(String owner, String key, UUID attemptId) {
        jdbc.update("""
                delete from idempotency.request_keys
                where owner = ? and idem_key = ? and attempt_id = ? and state = ?""",
                owner, key, attemptId, PENDING);
    }

    @Override
    public int purge(Instant createdBefore) {
        return jdbc.update("delete from idempotency.request_keys where created_at < ?", utc(createdBefore));
    }

    private static OffsetDateTime utc(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }
}
