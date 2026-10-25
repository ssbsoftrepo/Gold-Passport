package com.pmd.goldpassport.lots.internal;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.lots.LotCustody;
import com.pmd.goldpassport.lots.LotEvent;
import com.pmd.goldpassport.lots.LotStatus;
import com.pmd.goldpassport.lots.LotView;
import com.pmd.goldpassport.onboarding.ParticipantDirectory;
import com.pmd.goldpassport.shared.BadRequestException;
import com.pmd.goldpassport.shared.Codes;
import com.pmd.goldpassport.shared.ForbiddenException;
import com.pmd.goldpassport.shared.GeoPoint;
import com.pmd.goldpassport.shared.NotFoundException;
import com.pmd.goldpassport.shared.Role;
import com.pmd.goldpassport.shared.Validators;
import com.pmd.goldpassport.storage.FileStorage;
import com.pmd.goldpassport.storage.StoredFileInfo;

@Service
public class LotService implements LotCustody {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final LotRepository lots;
    private final FileStorage files;
    private final ParticipantDirectory participants;
    private final ApplicationEventPublisher events;
    private final LotProperties props;
    private final Clock clock;

    public LotService(LotRepository lots, FileStorage files, ParticipantDirectory participants,
            ApplicationEventPublisher events, LotProperties props, Clock clock) {
        this.lots = lots;
        this.files = files;
        this.participants = participants;
        this.events = events;
        this.props = props;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- miner use cases

    @Transactional
    public Lot create(CurrentUser me, String mineSiteName, String description) {
        me.requireRole(Role.MINER);
        participants.requireApproved(me);
        if (Validators.isBlank(mineSiteName)) {
            throw new BadRequestException("MINE_SITE_REQUIRED", "Mine site name is required");
        }
        Instant now = Instant.now(clock);
        Lot lot = lots.save(Lot.open(Codes.lotCode(), me.userId(), mineSiteName.trim(),
                description == null || description.isBlank() ? null : description.trim(), now));
        publish(LotEvent.Kind.CREATED, lot, me, Map.of("mineSiteName", lot.getMineSiteName()), now);
        return lot;
    }

    @Transactional
    public LotEvidence addPhoto(CurrentUser me, UUID lotId, MultipartFile photo, double latitude, double longitude,
            Double accuracyMeters, Instant capturedAt) {
        Lot lot = ownLot(me, lotId);
        Instant now = Instant.now(clock);
        if (capturedAt != null && capturedAt.isAfter(now.plus(props.maxClockSkew()))) {
            throw new BadRequestException("CAPTURED_IN_FUTURE", "capturedAt is in the future; check the device clock");
        }
        GeoPoint point = new GeoPoint(latitude, longitude);
        StoredFileInfo stored = files.store(photo, FILE_CONTEXT, lot.getId(), me.userId());
        if (!stored.contentType().startsWith("image/")) {
            throw new BadRequestException("PHOTO_REQUIRED", "Extraction evidence must be a photo");
        }
        LotEvidence evidence = lot.addEvidence(
                LotEvidence.of(stored.id(), stored.sha256(), point, accuracyMeters, capturedAt, now), now);
        Map<String, Object> details = new HashMap<>();
        details.put("fileSha256", stored.sha256());
        details.put("latitude", latitude);
        details.put("longitude", longitude);
        if (accuracyMeters != null) {
            details.put("accuracyMeters", accuracyMeters);
        }
        if (capturedAt != null) {
            details.put("capturedAt", capturedAt.toString());
        }
        publish(LotEvent.Kind.EVIDENCE_ADDED, lot, me, details, now);
        return evidence;
    }

    @Transactional
    public Lot complete(CurrentUser me, UUID lotId) {
        Lot lot = ownLot(me, lotId);
        Instant now = Instant.now(clock);
        lot.complete(Math.max(1, props.minPhotos()), now);
        publish(LotEvent.Kind.COMPLETED, lot, me, Map.of("evidenceCount", lot.getEvidence().size()), now);
        return lot;
    }

    @Transactional
    public Lot declareMinerLab(CurrentUser me, UUID lotId, MultipartFile report, BigDecimal purityPct,
            BigDecimal weightGrams, String labName) {
        Lot lot = ownLot(me, lotId);
        validateAssay(purityPct, weightGrams, labName);
        Instant now = Instant.now(clock);
        StoredFileInfo stored = files.store(report, FILE_CONTEXT, lot.getId(), me.userId());
        lot.declareMinerLab(labName.trim(), purityPct, weightGrams, stored.id(), now);
        publish(LotEvent.Kind.MINER_LAB_DECLARED, lot, me, Map.of(
                "labName", labName.trim(),
                "purityPct", purityPct,
                "weightGrams", weightGrams,
                "reportSha256", stored.sha256()), now);
        return lot;
    }

    // ---------------------------------------------------------------- queries

    @Transactional(readOnly = true)
    public List<Lot> listFor(CurrentUser me, LotStatus status) {
        return lots.findForParticipant(me.userId()).stream()
                .filter(l -> status == null || l.getStatus() == status)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Lot> listAll(LotStatus status) {
        return status == null ? lots.findAllByOrderByCreatedAtDesc() : lots.findByStatusOrderByCreatedAtDesc(status);
    }

    @Transactional(readOnly = true)
    public Lot getReadable(CurrentUser me, UUID lotId) {
        Lot lot = find(lotId);
        if (!me.isAdmin() && !lot.toView().isParticipant(me.userId())) {
            throw new ForbiddenException("NOT_A_PARTICIPANT", "You are not a participant of this lot");
        }
        return lot;
    }

    // ---------------------------------------------------------------- LotCustody (module API)

    @Override
    @Transactional(readOnly = true)
    public LotView get(UUID lotId) {
        return find(lotId).toView();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<LotView> findByCode(String code) {
        return lots.findByCode(code == null ? "" : code.trim().toUpperCase()).map(Lot::toView);
    }

    @Override
    @Transactional(readOnly = true)
    public LotView requireReadable(UUID lotId, CurrentUser user) {
        return getReadable(user, lotId).toView();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<GeoPoint> evidenceCentroid(UUID lotId) {
        return GeoPoint.centroid(find(lotId).getEvidence().stream().map(LotEvidence::point).toList());
    }

    @Override
    @Transactional
    public void assignToTransport(UUID lotId, UUID transportId, UUID transporterUserId, UUID collectorUserId,
            CurrentUser miner) {
        Lot lot = ownLot(miner, lotId);
        Instant now = Instant.now(clock);
        lot.assignToTransport(transportId, transporterUserId, collectorUserId, now);
        publish(LotEvent.Kind.ASSIGNED_TO_TRANSPORT, lot, miner, Map.of("transportId", transportId.toString()), now);
    }

    @Override
    @Transactional
    public void releaseFromTransport(UUID lotId, UUID transportId, CurrentUser actor) {
        Lot lot = find(lotId);
        Instant now = Instant.now(clock);
        lot.releaseFromTransport(transportId, now);
        publish(LotEvent.Kind.RELEASED_FROM_TRANSPORT, lot, actor, Map.of("transportId", transportId.toString()), now);
    }

    @Override
    @Transactional
    public void transferToTransporter(UUID lotId, UUID transportId, CurrentUser transporter) {
        Lot lot = find(lotId);
        Instant now = Instant.now(clock);
        lot.transferToTransporter(transportId, now);
        publish(LotEvent.Kind.CUSTODY_TO_TRANSPORTER, lot, transporter, Map.of("transportId", transportId.toString()), now);
    }

    @Override
    @Transactional
    public void transferToCollector(UUID lotId, UUID transportId, CurrentUser collector) {
        Lot lot = find(lotId);
        Instant now = Instant.now(clock);
        lot.transferToCollector(transportId, now);
        publish(LotEvent.Kind.CUSTODY_TO_COLLECTOR, lot, collector, Map.of("transportId", transportId.toString()), now);
    }

    @Override
    @Transactional
    public void markLabApproved(UUID lotId, BigDecimal purityPct, BigDecimal weightGrams, CurrentUser actor) {
        Lot lot = find(lotId);
        Instant now = Instant.now(clock);
        lot.labApproved(purityPct, weightGrams, now);
        publish(LotEvent.Kind.LAB_APPROVED, lot, actor, Map.of("purityPct", purityPct, "weightGrams", weightGrams), now);
    }

    @Override
    @Transactional
    public void markLabDiscrepancy(UUID lotId, CurrentUser actor) {
        Lot lot = find(lotId);
        Instant now = Instant.now(clock);
        lot.labDiscrepancy(now);
        publish(LotEvent.Kind.LAB_DISCREPANCY, lot, actor, Map.of(), now);
    }

    @Override
    @Transactional
    public void markSettled(UUID lotId, CurrentUser actor) {
        Lot lot = find(lotId);
        Instant now = Instant.now(clock);
        lot.settled(now);
        publish(LotEvent.Kind.SETTLED, lot, actor, Map.of(), now);
    }

    // ---------------------------------------------------------------- helpers

    static void validateAssay(BigDecimal purityPct, BigDecimal weightGrams, String labName) {
        if (purityPct == null || purityPct.signum() <= 0 || purityPct.compareTo(HUNDRED) > 0) {
            throw new BadRequestException("INVALID_PURITY", "Purity must be greater than 0 and at most 100 (%)");
        }
        if (weightGrams == null || weightGrams.signum() <= 0) {
            throw new BadRequestException("INVALID_WEIGHT", "Weight must be greater than 0 (grams)");
        }
        if (Validators.isBlank(labName)) {
            throw new BadRequestException("LAB_NAME_REQUIRED", "Laboratory name is required");
        }
    }

    private Lot find(UUID lotId) {
        return lots.findById(lotId).orElseThrow(() -> new NotFoundException("Lot", lotId));
    }

    private Lot ownLot(CurrentUser me, UUID lotId) {
        me.requireRole(Role.MINER);
        Lot lot = find(lotId);
        if (!lot.getMinerUserId().equals(me.userId())) {
            throw new ForbiddenException("NOT_OWNER", "This lot belongs to another miner");
        }
        return lot;
    }

    private void publish(LotEvent.Kind kind, Lot lot, CurrentUser actor, Map<String, Object> details, Instant now) {
        events.publishEvent(new LotEvent(kind, lot.getId(), lot.getCode(), lot.getMinerUserId(),
                lot.getCustodianUserId(), actor.userId(), actor.roleName(), details, now));
    }
}
