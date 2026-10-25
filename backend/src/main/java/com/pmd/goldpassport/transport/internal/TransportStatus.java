package com.pmd.goldpassport.transport.internal;

/**
 * <pre>
 * PENDING_CONFIRMATION --(miner + collector confirm)--> CONFIRMED --> EN_ROUTE_TO_MINER --> AT_MINER
 *        |  ^                                                                                 |
 *   decline  amend                                       (collector approves + miner hands over)
 *        v  |                                                                                 v
 *     DECLINED                    COMPLETED <-- DELIVERED <-- ARRIVED_AT_COLLECTOR <-- IN_TRANSIT
 *
 * CANCELLED: by the transporter at any point before IN_TRANSIT.
 * </pre>
 */
public enum TransportStatus {
    PENDING_CONFIRMATION,
    DECLINED,
    CONFIRMED,
    EN_ROUTE_TO_MINER,
    AT_MINER,
    IN_TRANSIT,
    ARRIVED_AT_COLLECTOR,
    DELIVERED,
    COMPLETED,
    CANCELLED;

    public boolean isCancellable() {
        return this == PENDING_CONFIRMATION || this == DECLINED || this == CONFIRMED
                || this == EN_ROUTE_TO_MINER || this == AT_MINER;
    }
}
