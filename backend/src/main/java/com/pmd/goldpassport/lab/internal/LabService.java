package com.pmd.goldpassport.lab.internal;

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
import com.pmd.goldpassport.lab.LabEvent;
import com.pmd.goldpassport.lab.LabQueries;
import com.pmd.goldpassport.lots.LotCustody;
import com.pmd.goldpassport.lots.LotStatus;
import com.pmd.goldpassport.lots.LotView;
import com.pmd.goldpassport.shared.BadRequestException;
import com.pmd.goldpassport.shared.ForbiddenException;
import com.pmd.goldpassport.shared.InvalidStateException;
import com.pmd.goldpassport.shared.NotFoundException;
import com.pmd.goldpassport.shared.Role;
import com.pmd.goldpassport.shared.Validators;
import com.pmd.goldpassport.storage.FileStorage;
import com.pmd.goldpassport.storage.StagedFile;
import com.pmd.goldpassport.storage.StoredFileInfo;

/**
 * Collector/Plant laboratory check: compares with the Miner's declaration and either approves the
 * lot for settlement or opens a discrepancy that PMD resolves.
 */
@Service
public class LabService implements LabQueries {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final LabResultRepository results;
    private final LotCustody lots;
    private final FileStorage files;
    private final ApplicationEventPublisher events;
    private final LabProperties props;
    private final Clock clock;

    public LabService(LabResultRepository results, LotCustody lots, FileStorage files, ApplicationEventPublisher events,
            LabProperties props, Clock clock) {
        this.results = results;
        this.lots = lots;
        this.files = files;
        this.events = events;
        this.props = props;
        this.clock = clock;
    }

    /** Not {@code @Transactional}: the report is uploaded first, then the result is saved in a short transaction. */
    public LabResult record(CurrentUser me, UUID lotId, MultipartFile report, BigDecimal purityPct,
            BigDecimal weightGrams, String labName) {
        me.requireRole(Role.COLLECTOR);
        validate(purityPct, weightGrams, labName);
        return files.withUpload(report, LotCustody.FILE_CONTEXT, me.userId(),
                staged -> record(me, lotId, staged, purityPct, weightGrams, labName));
    }

    private LabResult record(CurrentUser me, UUID lotId, StagedFile staged, BigDecimal purityPct,
            BigDecimal weightGrams, String labName) {
        LotView lot = lots.get(lotId);
        if (!me.userId().equals(lot.collectorUserId())) {
            throw new ForbiddenException("NOT_A_PARTICIPANT", "Only the receiving Collector/Plant can record the lab check");
        }
        if (lot.status() != LotStatus.DELIVERED) {
            throw InvalidStateException.of("Lot", lot.status(), "record laboratory check");
        }
        if (results.existsByLotId(lotId)) {
            throw new InvalidStateException("LAB_RESULT_EXISTS", "A laboratory result is already recorded for this lot");
        }
        Instant now = Instant.now(clock);
        StoredFileInfo stored = files.record(staged, lotId);
        AssayComparison cmp = AssayComparison.compare(lot.declaredPurityPct(), lot.declaredWeightGrams(), purityPct,
                weightGrams, props.purityTolerancePct(), props.weightTolerancePct());
        LabResult r = results.save(LabResult.record(lotId, lot.code(), lot.minerUserId(), me.userId(), labName.trim(),
                purityPct, weightGrams, lot.declaredPurityPct(), lot.declaredWeightGrams(), cmp, stored.id(),
                stored.sha256(), now));
        Map<String, Object> details = new HashMap<>();
        details.put("labName", r.getLabName());
        details.put("measuredPurityPct", purityPct);
        details.put("measuredWeightGrams", weightGrams);
        details.put("purityDeltaPct", cmp.purityDeltaPct());
        details.put("weightDeltaPct", cmp.weightDeltaPct());
        details.put("reportSha256", stored.sha256());
        if (r.isVerified()) {
            lots.markLabApproved(lotId, r.getFinalPurityPct(), r.getFinalWeightGrams(), me);
            publish(LabEvent.Kind.RESULT_APPROVED, r, me, details, now);
        } else {
            lots.markLabDiscrepancy(lotId, me);
            publish(LabEvent.Kind.DISCREPANCY_DETECTED, r, me, details, now);
        }
        return r;
    }

    @Transactional
    public LabResult resolve(CurrentUser admin, UUID lotId, BigDecimal finalPurity, BigDecimal finalWeight,
            String notes) {
        admin.requireRole(Role.ADMIN);
        validate(finalPurity, finalWeight, "resolution");
        if (Validators.isBlank(notes)) {
            throw new BadRequestException("NOTES_REQUIRED", "Explain how the discrepancy was resolved");
        }
        LabResult r = byLot(lotId);
        Instant now = Instant.now(clock);
        r.resolve(finalPurity, finalWeight, notes.trim(), admin.userId(), now);
        lots.markLabApproved(lotId, finalPurity, finalWeight, admin);
        publish(LabEvent.Kind.DISCREPANCY_RESOLVED, r, admin,
                Map.of("finalPurityPct", finalPurity, "finalWeightGrams", finalWeight, "notes", notes.trim()), now);
        return r;
    }

    @Transactional(readOnly = true)
    public LabResult get(CurrentUser me, UUID lotId) {
        lots.requireReadable(lotId, me);
        return byLot(lotId);
    }

    @Transactional(readOnly = true)
    public List<LabResult> list(LabResultStatus status) {
        return status == null ? results.findAllByOrderByRecordedAtDesc() : results.findByStatusOrderByRecordedAtAsc(status);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<VerifiedAssay> verifiedAssay(UUID lotId) {
        return results.findByLotId(lotId)
                .filter(LabResult::isVerified)
                .map(r -> new VerifiedAssay(lotId, r.getFinalPurityPct(), r.getFinalWeightGrams()));
    }

    private LabResult byLot(UUID lotId) {
        return results.findByLotId(lotId).orElseThrow(() -> new NotFoundException("Lab result for lot", lotId));
    }

    private void publish(LabEvent.Kind kind, LabResult r, CurrentUser actor, Map<String, Object> details, Instant now) {
        events.publishEvent(new LabEvent(kind, r.getId(), r.getLotId(), r.getLotCode(), r.getMinerUserId(),
                r.getCollectorUserId(), actor.userId(), actor.roleName(), details, now));
    }

    private static void validate(BigDecimal purityPct, BigDecimal weightGrams, String labName) {
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
}
