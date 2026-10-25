package com.pmd.goldpassport.settlement.internal;

/**
 * <pre>
 * PROPOSED --miner accepts--> MINER_ACCEPTED --PMD validates--> AGREED --collector pays--> PAID
 *    ^  |                           |
 *    |  +--miner disputes--+        +--PMD rejects--+
 *    |                     v                        v
 *    +--collector re-proposes-- DISPUTED <----------+
 * </pre>
 */
public enum SettlementStatus {
    PROPOSED,
    DISPUTED,
    MINER_ACCEPTED,
    AGREED,
    PAID
}
