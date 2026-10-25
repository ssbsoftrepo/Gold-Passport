package com.pmd.goldpassport.lots;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.pmd.goldpassport.shared.DomainEvent;

public record LotEvent(
        Kind kind,
        UUID lotId,
        String lotCode,
        UUID minerUserId,
        UUID custodianUserId,
        UUID actorUserId,
        String actorRole,
        Map<String, Object> details,
        Instant occurredAt) implements DomainEvent {

    public enum Kind {
        CREATED,
        EVIDENCE_ADDED,
        COMPLETED,
        MINER_LAB_DECLARED,
        ASSIGNED_TO_TRANSPORT,
        RELEASED_FROM_TRANSPORT,
        CUSTODY_TO_TRANSPORTER,
        CUSTODY_TO_COLLECTOR,
        LAB_APPROVED,
        LAB_DISCREPANCY,
        SETTLED
    }

    @Override
    public String eventType() {
        return "lot." + kind;
    }

    @Override
    public String aggregateType() {
        return "lot";
    }

    @Override
    public UUID aggregateId() {
        return lotId;
    }
}
