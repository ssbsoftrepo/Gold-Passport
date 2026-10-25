package com.pmd.goldpassport.lab;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.pmd.goldpassport.shared.DomainEvent;

public record LabEvent(
        Kind kind,
        UUID labResultId,
        UUID lotId,
        String lotCode,
        UUID minerUserId,
        UUID collectorUserId,
        UUID actorUserId,
        String actorRole,
        Map<String, Object> details,
        Instant occurredAt) implements DomainEvent {

    public enum Kind {
        /** Collector's result is within tolerance of the miner's declaration. Payment can start. */
        RESULT_APPROVED,
        DISCREPANCY_DETECTED,
        DISCREPANCY_RESOLVED
    }

    @Override
    public String eventType() {
        return "lab." + kind;
    }

    @Override
    public String aggregateType() {
        return "lab";
    }

    @Override
    public UUID aggregateId() {
        return labResultId;
    }
}
