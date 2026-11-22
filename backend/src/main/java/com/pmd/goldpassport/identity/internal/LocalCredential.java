package com.pmd.goldpassport.identity.internal;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/**
 * A person's PIN (or, for PMD staff, password) in local auth mode. Only its BCrypt hash is stored.
 * In Amazon Cognito mode the user pool keeps the secret and this table stays empty.
 */
@Entity
@Table(name = "local_credentials", schema = "identity")
public class LocalCredential {

    @Id
    private UUID userId;

    private String secretHash;

    /** Temporary secret from a PMD reset: it must be replaced before the person can sign in. */
    private boolean mustChange;

    private Instant temporaryExpiresAt;

    private int failedAttempts;

    private Instant lockedUntil;

    private Instant updatedAt;

    @Version
    private Long version;

    protected LocalCredential() {
    }

    public static LocalCredential create(UUID userId, String secretHash, Instant now) {
        LocalCredential c = new LocalCredential();
        c.userId = userId;
        c.secretHash = secretHash;
        c.updatedAt = now;
        return c;
    }

    /** Replaces the secret with one the person chose; clears a reset and any lock. */
    public void replace(String secretHash, Instant now) {
        this.secretHash = secretHash;
        this.mustChange = false;
        this.temporaryExpiresAt = null;
        this.failedAttempts = 0;
        this.lockedUntil = null;
        this.updatedAt = now;
    }

    /** A PMD reset: a temporary secret that must be replaced at the next sign-in. */
    public void resetTo(String temporaryHash, Instant now, Instant expiresAt) {
        replace(temporaryHash, now);
        this.mustChange = true;
        this.temporaryExpiresAt = expiresAt;
    }

    public boolean isLocked(Instant now) {
        return lockedUntil != null && now.isBefore(lockedUntil);
    }

    public boolean isTemporaryExpired(Instant now) {
        return mustChange && temporaryExpiresAt != null && !now.isBefore(temporaryExpiresAt);
    }

    /** Counts a wrong secret; after {@code maxAttempts} in a row the account is locked for {@code lockout}. */
    public void recordFailure(Instant now, int maxAttempts, Duration lockout) {
        failedAttempts++;
        updatedAt = now;
        if (failedAttempts >= maxAttempts) {
            lockedUntil = now.plus(lockout);
            failedAttempts = 0;
        }
    }

    public void recordSuccess(Instant now) {
        if (failedAttempts != 0 || lockedUntil != null) {
            failedAttempts = 0;
            lockedUntil = null;
            updatedAt = now;
        }
    }

    public UUID getUserId() {
        return userId;
    }

    public String getSecretHash() {
        return secretHash;
    }

    public boolean isMustChange() {
        return mustChange;
    }

    public Instant getTemporaryExpiresAt() {
        return temporaryExpiresAt;
    }
}
