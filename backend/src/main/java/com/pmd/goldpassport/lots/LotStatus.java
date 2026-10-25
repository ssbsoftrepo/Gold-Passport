package com.pmd.goldpassport.lots;

/**
 * Lifecycle of a lote (see docs/domain.md for the full state machine):
 *
 * <pre>
 * OPEN -> COMPLETED -> READY_FOR_TRANSPORT -> ASSIGNED_TO_TRANSPORT -> IN_TRANSIT -> DELIVERED
 *                              ^                    |                                    |
 *                              +---- released ------+               LAB_APPROVED <- LAB_DISCREPANCY
 *                                                                        |
 *                                                                     SETTLED
 * </pre>
 */
public enum LotStatus {
    /** Miner is adding extraction photos. */
    OPEN,
    /** Miner closed the lote; waiting for the miner's laboratory declaration. */
    COMPLETED,
    /** Weight and purity declared with a lab report. */
    READY_FOR_TRANSPORT,
    /** Miner handed the lote to a confirmed transport request. */
    ASSIGNED_TO_TRANSPORT,
    /** Picked up; the Transporter has custody. */
    IN_TRANSIT,
    /** Received by the Collector/Plant, who now has custody. */
    DELIVERED,
    /** Collector's lab result differs from the miner's declaration beyond tolerance. */
    LAB_DISCREPANCY,
    /** Purity and weight verified; ready for settlement. */
    LAB_APPROVED,
    /** Payment agreed and recorded. Terminal. */
    SETTLED
}
