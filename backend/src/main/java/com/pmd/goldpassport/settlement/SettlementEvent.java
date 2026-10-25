package com.pmd.goldpassport.settlement;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.pmd.goldpassport.shared.DomainEvent;

public record SettlementEvent(
        Kind kind,
        UUID settlementId,
        UUID lotId,
        String lotCode,
        UUID minerUserId,
        UUID collectorUserId,
        UUID actorUserId,
        String actorRole,
        Map<String, Object> details,
        Instant occurredAt) implements DomainEvent {

    public enum Kind {
        PROPOSED,
        ACCEPTED,
        DISPUTED,
        VALIDATED,
        REJECTED_BY_PMD,
        PAID
    }

    @Override
    public String eventType() {
        return "settlement." + kind;
    }

    @Override
    public String aggregateType() {
        return "settlement";
    }

    @Override
    public UUID aggregateId() {
        return settlementId;
    }
}
