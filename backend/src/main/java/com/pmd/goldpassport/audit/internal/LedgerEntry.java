package com.pmd.goldpassport.audit.internal;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Append-only ledger row. The database role used by the application should have INSERT/SELECT
 * only on this table in production (see docs/security.md); the hash chain makes any later edit
 * detectable regardless.
 */
@Entity
@Table(name = "ledger_entries", schema = "audit")
public class LedgerEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String chainKey;

    private long sequence;

    private String eventType;

    private String aggregateType;

    private UUID aggregateId;

    private UUID lotId;

    private UUID actorUserId;

    private String actorRole;

    private Instant occurredAt;

    /** Canonical JSON (sorted keys) of the event facts; hashed exactly as stored. */
    private String payload;

    private String prevHash;

    private String hash;

    private Instant recordedAt;

    protected LedgerEntry() {
    }

    LedgerEntry(String chainKey, long sequence, String eventType, String aggregateType, UUID aggregateId, UUID lotId,
            UUID actorUserId, String actorRole, Instant occurredAt, String payload, String prevHash, String hash,
            Instant recordedAt) {
        this.chainKey = chainKey;
        this.sequence = sequence;
        this.eventType = eventType;
        this.aggregateType = aggregateType;
        this.aggregateId = aggregateId;
        this.lotId = lotId;
        this.actorUserId = actorUserId;
        this.actorRole = actorRole;
        this.occurredAt = occurredAt;
        this.payload = payload;
        this.prevHash = prevHash;
        this.hash = hash;
        this.recordedAt = recordedAt;
    }

    public String getChainKey() {
        return chainKey;
    }

    public long getSequence() {
        return sequence;
    }

    public String getEventType() {
        return eventType;
    }

    public UUID getActorUserId() {
        return actorUserId;
    }

    public String getActorRole() {
        return actorRole;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public String getPayload() {
        return payload;
    }

    public String getPrevHash() {
        return prevHash;
    }

    public String getHash() {
        return hash;
    }
}
