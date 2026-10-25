package com.pmd.goldpassport.audit.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

class HashChainTest {

    private static final String KEY = "lot:" + UUID.randomUUID();
    private static final UUID ACTOR = UUID.randomUUID();

    private static List<LedgerEntry> chain(String... payloads) {
        List<LedgerEntry> list = new ArrayList<>();
        String prev = HashChain.GENESIS;
        long seq = 1;
        for (String p : payloads) {
            Instant at = Instant.parse("2026-10-21T10:00:00Z").plusSeconds(seq);
            String hash = HashChain.hash(prev, KEY, seq, "lot.EVENT", ACTOR, at, p);
            list.add(new LedgerEntry(KEY, seq, "lot.EVENT", "lot", UUID.randomUUID(), null, ACTOR, "MINER", at, p, prev,
                    hash, at));
            prev = hash;
            seq++;
        }
        return list;
    }

    @Test
    void untouchedChainVerifies() {
        assertThat(HashChain.verify(chain("{\"a\":1}", "{\"b\":2}", "{\"c\":3}"))).isTrue();
        assertThat(HashChain.verify(List.of())).isTrue();
    }

    @Test
    void editedPayloadBreaksChain() {
        List<LedgerEntry> list = chain("{\"a\":1}", "{\"b\":2}");
        LedgerEntry original = list.get(0);
        LedgerEntry forged = new LedgerEntry(KEY, 1, "lot.EVENT", "lot", UUID.randomUUID(), null, ACTOR, "MINER",
                original.getOccurredAt(), "{\"a\":999}", original.getPrevHash(), original.getHash(),
                original.getOccurredAt());
        list.set(0, forged);
        assertThat(HashChain.verify(list)).isFalse();
    }

    @Test
    void removedEntryBreaksChain() {
        List<LedgerEntry> list = chain("{\"a\":1}", "{\"b\":2}", "{\"c\":3}");
        list.remove(1);
        assertThat(HashChain.verify(list)).isFalse();
    }
}
