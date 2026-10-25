package com.pmd.goldpassport.transport.internal;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.lots.LotCustody;
import com.pmd.goldpassport.onboarding.ParticipantDirectory;
import com.pmd.goldpassport.relationships.RelationshipQueries;
import com.pmd.goldpassport.shared.BadRequestException;
import com.pmd.goldpassport.shared.BusinessRuleException;
import com.pmd.goldpassport.shared.Codes;
import com.pmd.goldpassport.shared.ForbiddenException;
import com.pmd.goldpassport.shared.GeoPoint;
import com.pmd.goldpassport.shared.NotFoundException;
import com.pmd.goldpassport.shared.Role;
import com.pmd.goldpassport.transport.TransportEvent;

/**
 * Orchestrates a transport. Lot custody changes go through {@link LotCustody} in the same
 * transaction so the transport and the lot can never disagree about who holds the gold.
 */
@Service
public class TransportService {

    private final TransportRepository transports;
    private final LotCustody lots;
    private final ParticipantDirectory participants;
    private final RelationshipQueries relationships;
    private final ApplicationEventPublisher events;
    private final TransportProperties props;
    private final Clock clock;

    public TransportService(TransportRepository transports, LotCustody lots, ParticipantDirectory participants,
            RelationshipQueries relationships, ApplicationEventPublisher events, TransportProperties props, Clock clock) {
        this.transports = transports;
        this.lots = lots;
        this.participants = participants;
        this.relationships = relationships;
        this.events = events;
        this.props = props;
        this.clock = clock;
    }

    public record Reading(double latitude, double longitude, Double accuracyMeters, Instant recordedAt) {
    }

    // ---------------------------------------------------------------- request & confirmation

    @Transactional
    public Transport create(CurrentUser me, UUID minerUserId, UUID collectorUserId, LocalDate plannedPickupDate,
            String notes) {
        me.requireRole(Role.TRANSPORTER);
        participants.requireApproved(me);
        validateParties(me, minerUserId, collectorUserId);
        Instant now = Instant.now(clock);
        Transport t = transports.save(Transport.request(Codes.transportCode(), me.userId(), minerUserId,
                collectorUserId, plannedPickupDate, blankToNull(notes), now));
        publish(TransportEvent.Kind.REQUESTED, t, me, plannedDetails(plannedPickupDate), now);
        return t;
    }

    @Transactional
    public Transport amend(CurrentUser me, UUID id, UUID minerUserId, UUID collectorUserId,
            LocalDate plannedPickupDate, String notes) {
        Transport t = asTransporter(me, id);
        validateParties(me, minerUserId, collectorUserId);
        releaseLotIfAssigned(t, me);
        Instant now = Instant.now(clock);
        t.amend(minerUserId, collectorUserId, plannedPickupDate, blankToNull(notes), now);
        publish(TransportEvent.Kind.AMENDED, t, me, plannedDetails(plannedPickupDate), now);
        return t;
    }

    @Transactional
    public Transport minerConfirm(CurrentUser me, UUID id, UUID lotId) {
        me.requireRole(Role.MINER);
        Transport t = find(id);
        if (!me.userId().equals(t.getMinerUserId())) {
            throw new ForbiddenException("NOT_A_PARTICIPANT", "You are not the miner of this transport");
        }
        if (lotId == null) {
            throw new BadRequestException("LOT_REQUIRED", "Select the lote to hand over");
        }
        Instant now = Instant.now(clock);
        // Validates ownership and READY_FOR_TRANSPORT, and links the lot to this transport.
        lots.assignToTransport(lotId, t.getId(), t.getTransporterUserId(), t.getCollectorUserId(), me);
        t.minerConfirm(lotId, lots.get(lotId).code(), now);
        publish(TransportEvent.Kind.MINER_CONFIRMED, t, me, Map.of(), now);
        confirmIfComplete(t, me, now);
        return t;
    }

    @Transactional
    public Transport collectorConfirm(CurrentUser me, UUID id) {
        Transport t = asCollector(me, id);
        Instant now = Instant.now(clock);
        t.collectorConfirm(now);
        publish(TransportEvent.Kind.COLLECTOR_CONFIRMED, t, me, Map.of(), now);
        confirmIfComplete(t, me, now);
        return t;
    }

    @Transactional
    public Transport decline(CurrentUser me, UUID id, String reason) {
        Transport t = find(id);
        boolean party = me.userId().equals(t.getMinerUserId()) || me.userId().equals(t.getCollectorUserId());
        if (!party) {
            throw new ForbiddenException("NOT_A_PARTICIPANT", "Only the miner or the collector can decline");
        }
        requireReason(reason);
        releaseLotIfAssigned(t, me);
        Instant now = Instant.now(clock);
        t.decline(me.userId(), reason.trim(), now);
        publish(TransportEvent.Kind.DECLINED, t, me, Map.of("reason", reason.trim()), now);
        return t;
    }

    @Transactional
    public Transport cancel(CurrentUser me, UUID id, String reason) {
        Transport t = asTransporter(me, id);
        requireReason(reason);
        UUID lotId = t.getLotId();
        Instant now = Instant.now(clock);
        t.cancel(reason.trim(), now);
        if (lotId != null) {
            lots.releaseFromTransport(lotId, t.getId(), me);
        }
        publishWithLot(TransportEvent.Kind.CANCELLED, t, lotId, me, Map.of("reason", reason.trim()), now);
        return t;
    }

    // ---------------------------------------------------------------- journey

    @Transactional
    public Transport depart(CurrentUser me, UUID id, Reading r) {
        Transport t = asTransporter(me, id);
        Instant now = Instant.now(clock);
        t.depart(checkpoint(CheckpointType.DEPARTED, r, now), now);
        publish(TransportEvent.Kind.DEPARTED, t, me, gps(r, now), now);
        return t;
    }

    @Transactional
    public Transport arriveAtMiner(CurrentUser me, UUID id, Reading r) {
        Transport t = asTransporter(me, id);
        Instant now = Instant.now(clock);
        GeoPoint arrival = new GeoPoint(r.latitude(), r.longitude());
        Optional<GeoPoint> origin = t.getLotId() == null ? Optional.empty() : lots.evidenceCentroid(t.getLotId());
        Double distance = origin.map(o -> round(o.distanceKm(arrival))).orElse(null);
        boolean mismatch = distance != null && distance > props.locationMismatchKm();
        t.arriveAtMiner(checkpoint(CheckpointType.ARRIVED_AT_MINER, r, now), distance, mismatch, now);
        Map<String, Object> details = gps(r, now);
        if (distance != null) {
            details.put("distanceToEvidenceKm", distance);
            details.put("locationMismatch", mismatch);
        }
        publish(TransportEvent.Kind.ARRIVED_AT_MINER, t, me, details, now);
        return t;
    }

    @Transactional
    public Transport approvePickup(CurrentUser me, UUID id) {
        Transport t = asCollector(me, id);
        Instant now = Instant.now(clock);
        t.approvePickup(now);
        publish(TransportEvent.Kind.PICKUP_APPROVED, t, me, Map.of(), now);
        return t;
    }

    @Transactional
    public Transport confirmHandover(CurrentUser me, UUID id) {
        me.requireRole(Role.MINER);
        Transport t = find(id);
        if (!me.userId().equals(t.getMinerUserId())) {
            throw new ForbiddenException("NOT_A_PARTICIPANT", "You are not the miner of this transport");
        }
        Instant now = Instant.now(clock);
        t.confirmHandover(now);
        publish(TransportEvent.Kind.HANDOVER_CONFIRMED, t, me, Map.of(), now);
        return t;
    }

    @Transactional
    public Transport pickUp(CurrentUser me, UUID id, Reading r) {
        Transport t = asTransporter(me, id);
        Instant now = Instant.now(clock);
        t.pickUp(checkpoint(CheckpointType.PICKED_UP, r, now), now);
        lots.transferToTransporter(t.getLotId(), t.getId(), me);
        publish(TransportEvent.Kind.PICKED_UP, t, me, gps(r, now), now);
        return t;
    }

    @Transactional
    public Transport recordLocation(CurrentUser me, UUID id, Reading r) {
        Transport t = asTransporter(me, id);
        Instant now = Instant.now(clock);
        t.recordLocation(checkpoint(CheckpointType.LOCATION_PING, r, now), now);
        publish(TransportEvent.Kind.LOCATION_RECORDED, t, me, gps(r, now), now);
        return t;
    }

    @Transactional
    public Transport arriveAtCollector(CurrentUser me, UUID id, Reading r) {
        Transport t = asTransporter(me, id);
        Instant now = Instant.now(clock);
        t.arriveAtCollector(checkpoint(CheckpointType.ARRIVED_AT_COLLECTOR, r, now), now);
        publish(TransportEvent.Kind.ARRIVED_AT_COLLECTOR, t, me, gps(r, now), now);
        return t;
    }

    @Transactional
    public Transport receive(CurrentUser me, UUID id) {
        Transport t = asCollector(me, id);
        Instant now = Instant.now(clock);
        t.receive(now);
        lots.transferToCollector(t.getLotId(), t.getId(), me);
        publish(TransportEvent.Kind.DELIVERED, t, me, Map.of(), now);
        return t;
    }

    @Transactional
    public Transport close(CurrentUser me, UUID id) {
        Transport t = asTransporter(me, id);
        Instant now = Instant.now(clock);
        t.close(now);
        publish(TransportEvent.Kind.COMPLETED, t, me, Map.of(), now);
        return t;
    }

    // ---------------------------------------------------------------- queries

    @Transactional(readOnly = true)
    public List<Transport> listFor(CurrentUser me, TransportStatus status) {
        return transports.findForParticipant(me.userId()).stream()
                .filter(t -> status == null || t.getStatus() == status)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Transport> listAll(TransportStatus status) {
        return status == null ? transports.findAllByOrderByUpdatedAtDesc() : transports.findByStatusOrderByUpdatedAtDesc(status);
    }

    @Transactional(readOnly = true)
    public Transport getReadable(CurrentUser me, UUID id) {
        Transport t = find(id);
        if (!me.isAdmin() && !t.involves(me.userId())) {
            throw new ForbiddenException("NOT_A_PARTICIPANT", "You are not a participant of this transport");
        }
        return t;
    }

    // ---------------------------------------------------------------- helpers

    private void validateParties(CurrentUser me, UUID minerUserId, UUID collectorUserId) {
        if (minerUserId == null || collectorUserId == null) {
            throw new BadRequestException("PARTIES_REQUIRED", "Select a Miner and a Collector/Plant");
        }
        participants.findApproved(minerUserId).filter(p -> p.role() == Role.MINER)
                .orElseThrow(() -> new BusinessRuleException("MINER_NOT_APPROVED", "The selected miner is not an approved Miner"));
        participants.findApproved(collectorUserId).filter(p -> p.role() == Role.COLLECTOR)
                .orElseThrow(() -> new BusinessRuleException("COLLECTOR_NOT_APPROVED",
                        "The selected collector is not an approved Collector/Plant"));
        if (!relationships.hasApprovedRelationship(me.userId(), minerUserId)) {
            throw new BusinessRuleException("RELATIONSHIP_REQUIRED", "You need an approved relationship with this Miner");
        }
        if (!relationships.hasApprovedRelationship(me.userId(), collectorUserId)) {
            throw new BusinessRuleException("RELATIONSHIP_REQUIRED",
                    "You need an approved relationship with this Collector/Plant");
        }
    }

    private void confirmIfComplete(Transport t, CurrentUser actor, Instant now) {
        if (t.confirmIfComplete(now)) {
            publish(TransportEvent.Kind.CONFIRMED, t, actor, Map.of(), now);
        }
    }

    private void releaseLotIfAssigned(Transport t, CurrentUser actor) {
        if (t.getLotId() != null) {
            lots.releaseFromTransport(t.getLotId(), t.getId(), actor);
        }
    }

    private TransportCheckpoint checkpoint(CheckpointType type, Reading r, Instant now) {
        Instant recordedAt = r.recordedAt() == null ? now : r.recordedAt();
        if (recordedAt.isAfter(now.plus(props.maxClockSkew()))) {
            throw new BadRequestException("RECORDED_IN_FUTURE", "recordedAt is in the future; check the device clock");
        }
        return TransportCheckpoint.of(type, new GeoPoint(r.latitude(), r.longitude()), r.accuracyMeters(), recordedAt, now);
    }

    private Transport asTransporter(CurrentUser me, UUID id) {
        me.requireRole(Role.TRANSPORTER);
        Transport t = find(id);
        if (!me.userId().equals(t.getTransporterUserId())) {
            throw new ForbiddenException("NOT_A_PARTICIPANT", "You are not the transporter of this transport");
        }
        return t;
    }

    private Transport asCollector(CurrentUser me, UUID id) {
        me.requireRole(Role.COLLECTOR);
        Transport t = find(id);
        if (!me.userId().equals(t.getCollectorUserId())) {
            throw new ForbiddenException("NOT_A_PARTICIPANT", "You are not the collector of this transport");
        }
        return t;
    }

    private Transport find(UUID id) {
        return transports.findById(id).orElseThrow(() -> new NotFoundException("Transport", id));
    }

    private void publish(TransportEvent.Kind kind, Transport t, CurrentUser actor, Map<String, Object> details,
            Instant now) {
        publishWithLot(kind, t, t.getLotId(), actor, details, now);
    }

    private void publishWithLot(TransportEvent.Kind kind, Transport t, UUID lotId, CurrentUser actor,
            Map<String, Object> details, Instant now) {
        Map<String, Object> d = new HashMap<>(details);
        d.put("transportCode", t.getCode());
        if (t.getLotCode() != null) {
            d.put("lotCode", t.getLotCode());
        }
        events.publishEvent(new TransportEvent(kind, t.getId(), t.getCode(), lotId, t.getTransporterUserId(),
                t.getMinerUserId(), t.getCollectorUserId(), actor.userId(), actor.roleName(), d, now));
    }

    private static Map<String, Object> gps(Reading r, Instant now) {
        Map<String, Object> d = new HashMap<>();
        d.put("latitude", r.latitude());
        d.put("longitude", r.longitude());
        if (r.accuracyMeters() != null) {
            d.put("accuracyMeters", r.accuracyMeters());
        }
        d.put("recordedAt", (r.recordedAt() == null ? now : r.recordedAt()).toString());
        return d;
    }

    private static Map<String, Object> plannedDetails(LocalDate planned) {
        Map<String, Object> d = new HashMap<>();
        if (planned != null) {
            d.put("plannedPickupDate", planned.toString());
        }
        return d;
    }

    private static void requireReason(String reason) {
        if (reason == null || reason.isBlank()) {
            throw new BadRequestException("REASON_REQUIRED", "A reason is required");
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static double round(double km) {
        return Math.round(km * 100.0) / 100.0;
    }
}
