package com.pmd.goldpassport.idempotency.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.pmd.goldpassport.support.PostgresIntegrationTest;

/** The SQL behind {@link IdempotencyStore}, including what happens when attempts race. */
class JdbcIdempotencyStoreTest extends PostgresIntegrationTest {

    private static final String OP = "POST /api/v1/lots/1/photos";

    @Autowired
    IdempotencyStore store;

    private final Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);

    private static String newKey() {
        return "test-" + UUID.randomUUID();
    }

    @Test
    void concurrentAttemptsWithTheSameKeyStartExactlyOnce() throws Exception {
        String key = newKey();
        int attempts = 8;
        CountDownLatch go = new CountDownLatch(1);
        List<Future<IdempotencyStore.Outcome>> outcomes = new ArrayList<>();
        try (ExecutorService pool = Executors.newFixedThreadPool(attempts)) {
            for (int i = 0; i < attempts; i++) {
                outcomes.add(pool.submit(() -> {
                    go.await();
                    return store.begin("user-1", key, OP, now, now.minus(Duration.ofMinutes(10)));
                }));
            }
            go.countDown();
            int started = 0;
            for (Future<IdempotencyStore.Outcome> f : outcomes) {
                IdempotencyStore.Outcome o = f.get();
                if (o instanceof IdempotencyStore.Started) {
                    started++;
                } else {
                    assertThat(o).isInstanceOf(IdempotencyStore.InProgress.class);
                }
            }
            assertThat(started).isEqualTo(1);
        }
    }

    @Test
    void completedResponsesAreReplayedAndFailedAttemptsReleased() {
        String done = newKey();
        var first = (IdempotencyStore.Started) store.begin("user-1", done, OP, now, now.minusSeconds(600));
        store.complete("user-1", done, first.attemptId(), 201, "application/json", bytes("{\"id\":1}"), now);

        assertThat(store.begin("user-1", done, OP, now, now.minusSeconds(600)))
                .isInstanceOfSatisfying(IdempotencyStore.Replay.class, r -> {
                    assertThat(r.status()).isEqualTo(201);
                    assertThat(new String(r.body(), StandardCharsets.UTF_8)).isEqualTo("{\"id\":1}");
                });
        assertThat(store.begin("user-1", done, "POST /api/v1/other", now, now.minusSeconds(600)))
                .isInstanceOf(IdempotencyStore.Mismatch.class);

        String failed = newKey();
        var attempt = (IdempotencyStore.Started) store.begin("user-1", failed, OP, now, now.minusSeconds(600));
        store.release("user-1", failed, attempt.attemptId());
        assertThat(store.begin("user-1", failed, OP, now, now.minusSeconds(600)))
                .isInstanceOf(IdempotencyStore.Started.class);
    }

    @Test
    void aTakenOverAttemptCannotFinishTheKeyItLost() {
        String key = newKey();
        Instant earlier = now.minus(Duration.ofHours(1));
        var slow = (IdempotencyStore.Started) store.begin("user-1", key, OP, earlier, earlier.minusSeconds(600));
        var retry = (IdempotencyStore.Started) store.begin("user-1", key, OP, now, now.minusSeconds(600));
        assertThat(retry.attemptId()).isNotEqualTo(slow.attemptId());

        // The slow attempt fails late: it must not free the key the retry now holds...
        store.release("user-1", key, slow.attemptId());
        assertThat(store.begin("user-1", key, OP, now, now.minusSeconds(600)))
                .isInstanceOf(IdempotencyStore.InProgress.class);
        // ...nor store its own response over the retry's.
        store.complete("user-1", key, retry.attemptId(), 201, "application/json", bytes("retry"), now);
        store.complete("user-1", key, slow.attemptId(), 201, "application/json", bytes("slow"), now);
        assertThat(store.begin("user-1", key, OP, now, now.minusSeconds(600)))
                .isInstanceOfSatisfying(IdempotencyStore.Replay.class,
                        r -> assertThat(new String(r.body(), StandardCharsets.UTF_8)).isEqualTo("retry"));
    }

    private static byte[] bytes(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }
}
