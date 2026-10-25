package com.pmd.goldpassport.relationships;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.pmd.goldpassport.shared.DomainEvent;

public record RelationshipEvent(
        Kind kind,
        UUID relationshipId,
        UUID ownerUserId,
        UUID counterpartyUserId,
        UUID actorUserId,
        String actorRole,
        Map<String, Object> details,
        Instant occurredAt) implements DomainEvent {

    public enum Kind {
        SUBMITTED,
        APPROVED,
        CLARIFICATION_REQUESTED,
        REJECTED
    }

    @Override
    public String eventType() {
        return "relationship." + kind;
    }

    @Override
    public String aggregateType() {
        return "relationship";
    }

    @Override
    public UUID aggregateId() {
        return relationshipId;
    }

    @Override
    public UUID lotId() {
        return null;
    }
}
