package com.pmd.goldpassport.audit.internal;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.pmd.goldpassport.shared.Hashing;

/**
 * Hash chain rules. Each entry's hash covers the previous entry's hash, so changing, removing or
 * re-ordering any entry breaks every hash after it.
 *
 * <pre>hash = SHA-256(prevHash | chainKey | sequence | eventType | actorUserId | occurredAt | payload)</pre>
 */
public final class HashChain {

    public static final String GENESIS = "0".repeat(64);

    private HashChain() {
    }

    public static String hash(String prevHash, String chainKey, long sequence, String eventType, UUID actorUserId,
            Instant occurredAt, String payload) {
        String material = String.join("|",
                prevHash,
                chainKey,
                Long.toString(sequence),
                eventType,
                actorUserId == null ? "" : actorUserId.toString(),
                occurredAt.toString(),
                payload);
        return Hashing.sha256Hex(material);
    }

    /** True when every entry recomputes and links to its predecessor, starting from genesis. */
    public static boolean verify(List<LedgerEntry> entriesInOrder) {
        String prev = GENESIS;
        long expectedSeq = 1;
        for (LedgerEntry e : entriesInOrder) {
            if (e.getSequence() != expectedSeq || !e.getPrevHash().equals(prev)) {
                return false;
            }
            String recomputed = hash(e.getPrevHash(), e.getChainKey(), e.getSequence(), e.getEventType(),
                    e.getActorUserId(), e.getOccurredAt(), e.getPayload());
            if (!recomputed.equals(e.getHash())) {
                return false;
            }
            prev = e.getHash();
            expectedSeq++;
        }
        return true;
    }
}
