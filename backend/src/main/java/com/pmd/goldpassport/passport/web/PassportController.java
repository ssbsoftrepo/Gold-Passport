package com.pmd.goldpassport.passport.web;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pmd.goldpassport.audit.LedgerQueries;
import com.pmd.goldpassport.audit.LedgerQueries.LedgerView;
import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.lots.LotCustody;
import com.pmd.goldpassport.lots.LotStatus;
import com.pmd.goldpassport.lots.LotView;
import com.pmd.goldpassport.shared.GeoPoint;
import com.pmd.goldpassport.shared.NotFoundException;

/**
 * The gold passport: a lot's chain of custody.
 * <ul>
 *   <li>{@code GET /api/v1/lots/{lotId}/ledger}: full ledger for participants and PMD.</li>
 *   <li>{@code GET /api/v1/public/passports/{lotCode}}: public, privacy-redacted view (no names,
 *       ids, amounts or precise locations) meant for a QR code on the lot's paperwork.</li>
 * </ul>
 */
@RestController
class PassportController {

    /** Events that are noise for a public reader. */
    private static final Set<String> HIDDEN_PUBLIC_EVENTS = Set.of("transport.LOCATION_RECORDED");

    private final LotCustody lots;
    private final LedgerQueries ledger;
    private final ObjectMapper json;
    private final Clock clock;

    PassportController(LotCustody lots, LedgerQueries ledger, ObjectMapper json, Clock clock) {
        this.lots = lots;
        this.ledger = ledger;
        this.json = json;
        this.clock = clock;
    }

    record LedgerEntryDto(long sequence, String eventType, UUID actorUserId, String actorRole, Instant occurredAt,
            Map<String, Object> payload, String prevHash, String hash) {
    }

    record LotLedger(UUID lotId, String lotCode, boolean verified, String headHash, List<LedgerEntryDto> entries) {
    }

    record PassportEvent(String eventType, String actorRole, Instant occurredAt, GeoPoint approximateLocation) {
    }

    record GoldPassport(String lotCode, LotStatus status, String mineSiteName, GeoPoint approximateOrigin,
            int evidenceCount, BigDecimal declaredWeightGrams, BigDecimal declaredPurityPct,
            BigDecimal verifiedWeightGrams, BigDecimal verifiedPurityPct, List<PassportEvent> timeline,
            boolean ledgerVerified, String headHash, Instant generatedAt) {
    }

    @GetMapping("/api/v1/lots/{lotId}/ledger")
    LotLedger lotLedger(CurrentUser me, @PathVariable UUID lotId) {
        LotView lot = lots.requireReadable(lotId, me);
        LedgerView view = ledger.lotLedger(lotId);
        List<LedgerEntryDto> entries = view.entries().stream()
                .map(e -> new LedgerEntryDto(e.sequence(), e.eventType(), e.actorUserId(), e.actorRole(),
                        e.occurredAt(), parse(e.payloadJson()), e.prevHash(), e.hash()))
                .toList();
        return new LotLedger(lot.id(), lot.code(), view.verified(), view.headHash(), entries);
    }

    @GetMapping("/api/v1/public/passports/{lotCode}")
    GoldPassport passport(@PathVariable String lotCode) {
        LotView lot = lots.findByCode(lotCode).orElseThrow(() -> new NotFoundException("Lot", lotCode));
        LedgerView view = ledger.lotLedger(lot.id());
        List<PassportEvent> timeline = new ArrayList<>();
        for (LedgerQueries.Entry e : view.entries()) {
            if (HIDDEN_PUBLIC_EVENTS.contains(e.eventType())) {
                continue;
            }
            timeline.add(new PassportEvent(e.eventType(), e.actorRole(), e.occurredAt(), approximateLocation(e.payloadJson())));
        }
        GeoPoint origin = lots.evidenceCentroid(lot.id()).map(GeoPoint::approximate).orElse(null);
        return new GoldPassport(lot.code(), lot.status(), lot.mineSiteName(), origin, lot.evidenceCount(),
                lot.declaredWeightGrams(), lot.declaredPurityPct(), lot.verifiedWeightGrams(), lot.verifiedPurityPct(),
                Collections.unmodifiableList(timeline), view.verified(), view.headHash(), Instant.now(clock));
    }

    private GeoPoint approximateLocation(String payloadJson) {
        Map<String, Object> payload = parse(payloadJson);
        if (!(payload.get("details") instanceof Map<?, ?> details)) {
            return null;
        }
        if (details.get("latitude") instanceof Number lat && details.get("longitude") instanceof Number lon) {
            return new GeoPoint(lat.doubleValue(), lon.doubleValue()).approximate();
        }
        return null;
    }

    private Map<String, Object> parse(String payloadJson) {
        try {
            return json.readValue(payloadJson, new TypeReference<Map<String, Object>>() {
            });
        } catch (JsonProcessingException e) {
            return Map.of();
        }
    }
}
