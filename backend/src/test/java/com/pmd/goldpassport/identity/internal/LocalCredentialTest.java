package com.pmd.goldpassport.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

class LocalCredentialTest {

    private final Instant now = Instant.parse("2026-11-22T10:00:00Z");

    @Test
    void locksAfterTheMaximumWrongPinsAndUnlocksLater() {
        LocalCredential c = LocalCredential.create(UUID.randomUUID(), "hash", now);
        c.recordFailure(now, 3, Duration.ofMinutes(15));
        c.recordFailure(now, 3, Duration.ofMinutes(15));
        assertThat(c.isLocked(now)).isFalse();
        c.recordFailure(now, 3, Duration.ofMinutes(15));
        assertThat(c.isLocked(now.plusSeconds(60))).isTrue();
        assertThat(c.isLocked(now.plus(Duration.ofMinutes(15)))).isFalse();
    }

    @Test
    void aCorrectPinClearsTheCount() {
        LocalCredential c = LocalCredential.create(UUID.randomUUID(), "hash", now);
        c.recordFailure(now, 3, Duration.ofMinutes(15));
        c.recordFailure(now, 3, Duration.ofMinutes(15));
        c.recordSuccess(now);
        c.recordFailure(now, 3, Duration.ofMinutes(15));
        assertThat(c.isLocked(now)).isFalse();
    }

    @Test
    void aTemporaryPinExpiresAndIsGoneOnceReplaced() {
        LocalCredential c = LocalCredential.create(UUID.randomUUID(), "hash", now);
        c.resetTo("temp", now, now.plus(Duration.ofDays(7)));
        assertThat(c.isMustChange()).isTrue();
        assertThat(c.isTemporaryExpired(now.plus(Duration.ofDays(6)))).isFalse();
        assertThat(c.isTemporaryExpired(now.plus(Duration.ofDays(7)))).isTrue();
        c.replace("new", now);
        assertThat(c.isMustChange()).isFalse();
        assertThat(c.isTemporaryExpired(now.plus(Duration.ofDays(30)))).isFalse();
    }
}
