package com.pmd.goldpassport.lab.internal;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import com.pmd.goldpassport.shared.InvalidStateException;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/** The Collector/Plant's laboratory check of a delivered lot (one per lot). */
@Entity
@Table(name = "lab_results", schema = "lab")
public class LabResult {

    @Id
    private UUID id;

    private UUID lotId;

    private String lotCode;

    private UUID minerUserId;

    private UUID collectorUserId;

    private String labName;

    private BigDecimal measuredPurityPct;

    private BigDecimal measuredWeightGrams;

    private BigDecimal declaredPurityPct;

    private BigDecimal declaredWeightGrams;

    private BigDecimal purityDeltaPct;

    private BigDecimal weightDeltaPct;

    @Enumerated(EnumType.STRING)
    private LabResultStatus status;

    private UUID reportFileId;

    private String reportSha256;

    private BigDecimal finalPurityPct;

    private BigDecimal finalWeightGrams;

    private String resolutionNotes;

    private UUID resolvedBy;

    private Instant resolvedAt;

    private Instant recordedAt;

    @Version
    private Long version;

    protected LabResult() {
    }

    public static LabResult record(UUID lotId, String lotCode, UUID minerUserId, UUID collectorUserId, String labName,
            BigDecimal measuredPurity, BigDecimal measuredWeight, BigDecimal declaredPurity, BigDecimal declaredWeight,
            AssayComparison comparison, UUID reportFileId, String reportSha256, Instant now) {
        LabResult r = new LabResult();
        r.id = UUID.randomUUID();
        r.lotId = lotId;
        r.lotCode = lotCode;
        r.minerUserId = minerUserId;
        r.collectorUserId = collectorUserId;
        r.labName = labName;
        r.measuredPurityPct = measuredPurity;
        r.measuredWeightGrams = measuredWeight;
        r.declaredPurityPct = declaredPurity;
        r.declaredWeightGrams = declaredWeight;
        r.purityDeltaPct = comparison.purityDeltaPct();
        r.weightDeltaPct = comparison.weightDeltaPct();
        r.reportFileId = reportFileId;
        r.reportSha256 = reportSha256;
        r.recordedAt = now;
        if (comparison.withinTolerance()) {
            // The Collector/Plant's lab is the reference measurement for settlement.
            r.status = LabResultStatus.APPROVED;
            r.finalPurityPct = measuredPurity;
            r.finalWeightGrams = measuredWeight;
        } else {
            r.status = LabResultStatus.DISCREPANCY_OPEN;
        }
        return r;
    }

    public void resolve(BigDecimal finalPurity, BigDecimal finalWeight, String notes, UUID resolvedBy, Instant now) {
        if (status != LabResultStatus.DISCREPANCY_OPEN) {
            throw InvalidStateException.of("Lab result", status, "resolve discrepancy");
        }
        this.finalPurityPct = finalPurity;
        this.finalWeightGrams = finalWeight;
        this.resolutionNotes = notes;
        this.resolvedBy = resolvedBy;
        this.resolvedAt = now;
        this.status = LabResultStatus.DISCREPANCY_RESOLVED;
    }

    public boolean isVerified() {
        return status == LabResultStatus.APPROVED || status == LabResultStatus.DISCREPANCY_RESOLVED;
    }

    public UUID getId() {
        return id;
    }

    public UUID getLotId() {
        return lotId;
    }

    public String getLotCode() {
        return lotCode;
    }

    public UUID getMinerUserId() {
        return minerUserId;
    }

    public UUID getCollectorUserId() {
        return collectorUserId;
    }

    public String getLabName() {
        return labName;
    }

    public BigDecimal getMeasuredPurityPct() {
        return measuredPurityPct;
    }

    public BigDecimal getMeasuredWeightGrams() {
        return measuredWeightGrams;
    }

    public BigDecimal getDeclaredPurityPct() {
        return declaredPurityPct;
    }

    public BigDecimal getDeclaredWeightGrams() {
        return declaredWeightGrams;
    }

    public BigDecimal getPurityDeltaPct() {
        return purityDeltaPct;
    }

    public BigDecimal getWeightDeltaPct() {
        return weightDeltaPct;
    }

    public LabResultStatus getStatus() {
        return status;
    }

    public UUID getReportFileId() {
        return reportFileId;
    }

    public BigDecimal getFinalPurityPct() {
        return finalPurityPct;
    }

    public BigDecimal getFinalWeightGrams() {
        return finalWeightGrams;
    }

    public String getResolutionNotes() {
        return resolutionNotes;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    public Instant getRecordedAt() {
        return recordedAt;
    }
}
