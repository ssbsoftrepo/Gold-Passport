package com.pmd.goldpassport.lots.internal;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.pmd.goldpassport.lots.LotStatus;
import com.pmd.goldpassport.lots.LotView;
import com.pmd.goldpassport.shared.BusinessRuleException;
import com.pmd.goldpassport.shared.InvalidStateException;
import com.pmd.goldpassport.shared.Role;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/** A lote of gold. All state transitions are guarded here; services only orchestrate. */
@Entity
@Table(name = "lots", schema = "lots")
public class Lot {

    @Id
    private UUID id;

    private String code;

    @Enumerated(EnumType.STRING)
    private LotStatus status;

    private UUID minerUserId;

    private String mineSiteName;

    private String description;

    private UUID transporterUserId;

    private UUID collectorUserId;

    private UUID custodianUserId;

    @Enumerated(EnumType.STRING)
    private Role custodianRole;

    private UUID currentTransportId;

    private BigDecimal declaredWeightGrams;

    private BigDecimal declaredPurityPct;

    private String minerLabName;

    private UUID minerLabReportFileId;

    private Instant minerLabReportedAt;

    private BigDecimal verifiedWeightGrams;

    private BigDecimal verifiedPurityPct;

    private Instant createdAt;

    private Instant completedAt;

    private Instant updatedAt;

    @Version
    private Long version;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JoinColumn(name = "lot_id", nullable = false)
    @OrderBy("receivedAt ASC")
    private List<LotEvidence> evidence = new ArrayList<>();

    protected Lot() {
    }

    public static Lot open(String code, UUID minerUserId, String mineSiteName, String description, Instant now) {
        Lot lot = new Lot();
        lot.id = UUID.randomUUID();
        lot.code = code;
        lot.status = LotStatus.OPEN;
        lot.minerUserId = minerUserId;
        lot.mineSiteName = mineSiteName;
        lot.description = description;
        lot.custodianUserId = minerUserId;
        lot.custodianRole = Role.MINER;
        lot.createdAt = now;
        lot.updatedAt = now;
        return lot;
    }

    // ---------------------------------------------------------------- miner actions

    public LotEvidence addEvidence(LotEvidence e, Instant now) {
        require(LotStatus.OPEN, "add extraction photos");
        evidence.add(e);
        updatedAt = now;
        return e;
    }

    public void complete(int minPhotos, Instant now) {
        require(LotStatus.OPEN, "complete");
        if (evidence.size() < minPhotos) {
            throw new BusinessRuleException("EVIDENCE_REQUIRED",
                    "At least " + minPhotos + " extraction photo(s) with GPS are required");
        }
        status = LotStatus.COMPLETED;
        completedAt = now;
        updatedAt = now;
    }

    /** Allowed once completed, and again (correction) while not yet handed to a transport. */
    public void declareMinerLab(String labName, BigDecimal purityPct, BigDecimal weightGrams, UUID reportFileId,
            Instant now) {
        if (status != LotStatus.COMPLETED && status != LotStatus.READY_FOR_TRANSPORT) {
            throw InvalidStateException.of("Lot", status, "declare laboratory result");
        }
        minerLabName = labName;
        declaredPurityPct = purityPct;
        declaredWeightGrams = weightGrams;
        minerLabReportFileId = reportFileId;
        minerLabReportedAt = now;
        status = LotStatus.READY_FOR_TRANSPORT;
        updatedAt = now;
    }

    // ---------------------------------------------------------------- custody (called through LotCustody)

    void assignToTransport(UUID transportId, UUID transporterUserId, UUID collectorUserId, Instant now) {
        require(LotStatus.READY_FOR_TRANSPORT, "assign to transport");
        currentTransportId = transportId;
        this.transporterUserId = transporterUserId;
        this.collectorUserId = collectorUserId;
        status = LotStatus.ASSIGNED_TO_TRANSPORT;
        updatedAt = now;
    }

    void releaseFromTransport(UUID transportId, Instant now) {
        require(LotStatus.ASSIGNED_TO_TRANSPORT, "release from transport");
        requireTransport(transportId);
        currentTransportId = null;
        transporterUserId = null;
        collectorUserId = null;
        status = LotStatus.READY_FOR_TRANSPORT;
        updatedAt = now;
    }

    void transferToTransporter(UUID transportId, Instant now) {
        require(LotStatus.ASSIGNED_TO_TRANSPORT, "transfer custody to transporter");
        requireTransport(transportId);
        custodianUserId = transporterUserId;
        custodianRole = Role.TRANSPORTER;
        status = LotStatus.IN_TRANSIT;
        updatedAt = now;
    }

    void transferToCollector(UUID transportId, Instant now) {
        require(LotStatus.IN_TRANSIT, "transfer custody to collector");
        requireTransport(transportId);
        custodianUserId = collectorUserId;
        custodianRole = Role.COLLECTOR;
        status = LotStatus.DELIVERED;
        updatedAt = now;
    }

    void labApproved(BigDecimal purityPct, BigDecimal weightGrams, Instant now) {
        if (status != LotStatus.DELIVERED && status != LotStatus.LAB_DISCREPANCY) {
            throw InvalidStateException.of("Lot", status, "approve laboratory result");
        }
        verifiedPurityPct = purityPct;
        verifiedWeightGrams = weightGrams;
        status = LotStatus.LAB_APPROVED;
        updatedAt = now;
    }

    void labDiscrepancy(Instant now) {
        require(LotStatus.DELIVERED, "flag laboratory discrepancy");
        status = LotStatus.LAB_DISCREPANCY;
        updatedAt = now;
    }

    void settled(Instant now) {
        require(LotStatus.LAB_APPROVED, "settle");
        status = LotStatus.SETTLED;
        updatedAt = now;
    }

    private void require(LotStatus expected, String action) {
        if (status != expected) {
            throw InvalidStateException.of("Lot", status, action);
        }
    }

    private void requireTransport(UUID transportId) {
        if (currentTransportId == null || !currentTransportId.equals(transportId)) {
            throw new InvalidStateException("LOT_NOT_ON_TRANSPORT", "Lot is not assigned to transport " + transportId);
        }
    }

    public LotView toView() {
        return new LotView(id, code, status, minerUserId, transporterUserId, collectorUserId, custodianUserId,
                custodianRole, currentTransportId, mineSiteName, declaredWeightGrams, declaredPurityPct,
                verifiedWeightGrams, verifiedPurityPct, evidence.size(), createdAt);
    }

    // ---------------------------------------------------------------- getters

    public UUID getId() {
        return id;
    }

    public String getCode() {
        return code;
    }

    public LotStatus getStatus() {
        return status;
    }

    public UUID getMinerUserId() {
        return minerUserId;
    }

    public String getMineSiteName() {
        return mineSiteName;
    }

    public String getDescription() {
        return description;
    }

    public UUID getTransporterUserId() {
        return transporterUserId;
    }

    public UUID getCollectorUserId() {
        return collectorUserId;
    }

    public UUID getCustodianUserId() {
        return custodianUserId;
    }

    public Role getCustodianRole() {
        return custodianRole;
    }

    public UUID getCurrentTransportId() {
        return currentTransportId;
    }

    public BigDecimal getDeclaredWeightGrams() {
        return declaredWeightGrams;
    }

    public BigDecimal getDeclaredPurityPct() {
        return declaredPurityPct;
    }

    public String getMinerLabName() {
        return minerLabName;
    }

    public UUID getMinerLabReportFileId() {
        return minerLabReportFileId;
    }

    public BigDecimal getVerifiedWeightGrams() {
        return verifiedWeightGrams;
    }

    public BigDecimal getVerifiedPurityPct() {
        return verifiedPurityPct;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public List<LotEvidence> getEvidence() {
        return evidence;
    }
}
