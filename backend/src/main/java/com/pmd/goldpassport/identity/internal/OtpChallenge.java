package com.pmd.goldpassport.identity.internal;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/** A one-time login code for local auth mode. Only the SHA-256 of the code is stored. */
@Entity
@Table(name = "otp_challenges", schema = "identity")
public class OtpChallenge {

    @Id
    private UUID id;

    private String phone;

    private String codeHash;

    private Instant expiresAt;

    private int attempts;

    private Instant consumedAt;

    private Instant createdAt;

    @Version
    private Long version;

    protected OtpChallenge() {
    }

    public static OtpChallenge issue(String phone, String codeHash, Instant now, Instant expiresAt) {
        OtpChallenge c = new OtpChallenge();
        c.id = UUID.randomUUID();
        c.phone = phone;
        c.codeHash = codeHash;
        c.createdAt = now;
        c.expiresAt = expiresAt;
        return c;
    }

    public boolean isUsable(Instant now, int maxAttempts) {
        return consumedAt == null && now.isBefore(expiresAt) && attempts < maxAttempts;
    }

    public void recordFailedAttempt() {
        attempts++;
    }

    public void consume(Instant now) {
        consumedAt = now;
    }

    public String getCodeHash() {
        return codeHash;
    }

    public String getPhone() {
        return phone;
    }
}
