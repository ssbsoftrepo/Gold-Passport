package com.pmd.goldpassport.audit;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Public API of the audit module: read and verify hash-chained ledgers. */
public interface LedgerQueries {

    /** All entries chained to the given lot, oldest first, with integrity verification. */
    LedgerView lotLedger(UUID lotId);

    record LedgerView(String chainKey, boolean verified, String headHash, List<Entry> entries) {
    }

    record Entry(long sequence, String eventType, UUID actorUserId, String actorRole, Instant occurredAt,
            String payloadJson, String prevHash, String hash) {
    }
}
