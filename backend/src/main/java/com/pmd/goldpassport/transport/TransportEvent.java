package com.pmd.goldpassport.transport;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.pmd.goldpassport.shared.DomainEvent;

/**
 * Published on every transport state change. Once the miner has attached a lot, {@link #lotId()}
 * is set and the event becomes part of that lot's custody ledger.
 */
public record TransportEvent(
        Kind kind,
        UUID transportId,
        String transportCode,
        UUID lotId,
        UUID transporterUserId,
        UUID minerUserId,
        UUID collectorUserId,
        UUID actorUserId,
        String actorRole,
        Map<String, Object> details,
        Instant occurredAt) implements DomainEvent {

    public enum Kind {
        REQUESTED,
        AMENDED,
        MINER_CONFIRMED,
        COLLECTOR_CONFIRMED,
        CONFIRMED,
        DECLINED,
        CANCELLED,
        DEPARTED,
        ARRIVED_AT_MINER,
        PICKUP_APPROVED,
        HANDOVER_CONFIRMED,
        PICKED_UP,
        LOCATION_RECORDED,
        ARRIVED_AT_COLLECTOR,
        DELIVERED,
        COMPLETED
    }

    @Override
    public String eventType() {
        return "transport." + kind;
    }

    @Override
    public String aggregateType() {
        return "transport";
    }

    @Override
    public UUID aggregateId() {
        return transportId;
    }
}
