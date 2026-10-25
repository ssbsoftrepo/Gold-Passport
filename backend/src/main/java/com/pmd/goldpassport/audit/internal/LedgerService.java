package com.pmd.goldpassport.audit.internal;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.pmd.goldpassport.audit.LedgerQueries;
import com.pmd.goldpassport.shared.DomainEvent;

/**
 * Records every {@link DomainEvent} synchronously, inside the transaction that published it, so a
 * business change and its ledger entry commit or roll back together.
 */
@Service
public class LedgerService implements LedgerQueries {

    private final LedgerEntryRepository entries;
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final ObjectMapper canonical;

    public LedgerService(LedgerEntryRepository entries, JdbcTemplate jdbc, Clock clock) {
        this.entries = entries;
        this.jdbc = jdbc;
        this.clock = clock;
        this.canonical = JsonMapper.builder()
                .addModule(new JavaTimeModule())
                .configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true)
                .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true)
                .configure(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS, false)
                .build();
    }

    public static String chainKeyFor(DomainEvent event) {
        return event.lotId() != null ? lotChainKey(event.lotId()) : event.aggregateType() + ":" + event.aggregateId();
    }

    public static String lotChainKey(UUID lotId) {
        return "lot:" + lotId;
    }

    @EventListener
    @Transactional(propagation = Propagation.REQUIRED)
    public void record(DomainEvent event) {
        String chainKey = chainKeyFor(event);
        // Serialize writers per chain so two concurrent events cannot fork the chain.
        jdbc.query("select pg_advisory_xact_lock(hashtext(?))", (RowCallbackHandler) rs -> { }, chainKey);
        LedgerEntry last = entries.findFirstByChainKeyOrderBySequenceDesc(chainKey).orElse(null);
        long sequence = last == null ? 1 : last.getSequence() + 1;
        String prevHash = last == null ? HashChain.GENESIS : last.getHash();
        // Postgres stores microseconds; truncate so the hash recomputes identically after a round trip.
        Instant occurredAt = event.occurredAt().truncatedTo(ChronoUnit.MICROS);
        String payload = payload(event);
        String hash = HashChain.hash(prevHash, chainKey, sequence, event.eventType(), event.actorUserId(), occurredAt, payload);
        entries.save(new LedgerEntry(chainKey, sequence, event.eventType(), event.aggregateType(), event.aggregateId(),
                event.lotId(), event.actorUserId(), event.actorRole(), occurredAt, payload, prevHash, hash,
                Instant.now(clock)));
    }

    @Override
    @Transactional(readOnly = true)
    public LedgerView lotLedger(UUID lotId) {
        String chainKey = lotChainKey(lotId);
        List<LedgerEntry> list = entries.findByChainKeyOrderBySequenceAsc(chainKey);
        boolean verified = HashChain.verify(list);
        String head = list.isEmpty() ? null : list.get(list.size() - 1).getHash();
        return new LedgerView(chainKey, verified, head, list.stream()
                .map(e -> new Entry(e.getSequence(), e.getEventType(), e.getActorUserId(), e.getActorRole(),
                        e.getOccurredAt(), e.getPayload(), e.getPrevHash(), e.getHash()))
                .toList());
    }

    private String payload(DomainEvent event) {
        Map<String, Object> facts = new LinkedHashMap<>();
        facts.put("aggregateType", event.aggregateType());
        facts.put("aggregateId", event.aggregateId());
        facts.put("details", event.details() == null ? Map.of() : event.details());
        try {
            return canonical.writeValueAsString(facts);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize ledger payload for " + event.eventType(), e);
        }
    }
}
