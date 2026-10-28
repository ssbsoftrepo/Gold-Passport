package com.pmd.goldpassport.audit.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.pmd.goldpassport.shared.DomainEvent;

/**
 * Ledger payloads are stored, hashed and shown on the public passport, so their JSON must not change
 * when a library is upgraded: keys sorted, ISO-8601 instants, numbers as written.
 */
class LedgerPayloadFormatTest {

    record Event(Map<String, Object> details) implements DomainEvent {
        @Override
        public String eventType() {
            return "lot.EVIDENCE_ADDED";
        }

        @Override
        public String aggregateType() {
            return "lot";
        }

        @Override
        public UUID aggregateId() {
            return UUID.fromString("5bd345da-a286-4e97-9586-bae495aecf80");
        }

        @Override
        public UUID lotId() {
            return aggregateId();
        }

        @Override
        public UUID actorUserId() {
            return null;
        }

        @Override
        public String actorRole() {
            return "SYSTEM";
        }

        @Override
        public Instant occurredAt() {
            return Instant.parse("2026-10-28T06:57:55Z");
        }
    }

    @Test
    void payloadJsonIsStable() {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("weightGrams", 150);
        details.put("purityPct", new BigDecimal("92.50"));
        details.put("latitude", -14.8312);
        details.put("locationMismatch", false);
        details.put("recordedAt", Instant.parse("2026-10-28T06:57:55.358945729Z"));
        details.put("fileId", UUID.fromString("89a9ce33-7d75-42d6-9822-f5a15bcb332a"));
        details.put("notes", null);
        details.put("nested", Map.of("b", "ñandú", "a", List.of(1, 2)));
        LedgerService ledger = new LedgerService(null, null, Clock.systemUTC());

        assertThat(ledger.payload(new Event(details))).isEqualTo("{\"aggregateId\":\"5bd345da-a286-4e97-9586-bae495aecf80\","
                + "\"aggregateType\":\"lot\",\"details\":{\"fileId\":\"89a9ce33-7d75-42d6-9822-f5a15bcb332a\","
                + "\"latitude\":-14.8312,\"locationMismatch\":false,\"nested\":{\"a\":[1,2],\"b\":\"ñandú\"},\"notes\":null,"
                + "\"purityPct\":92.50,\"recordedAt\":\"2026-10-28T06:57:55.358945729Z\",\"weightGrams\":150}}");
    }
}
