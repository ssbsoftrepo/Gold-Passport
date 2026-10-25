package com.pmd.goldpassport.transport.internal;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.pmd.goldpassport.shared.InvalidStateException;

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

/** A transport of one lot from a Miner to a Collector/Plant. State machine guards live here. */
@Entity
@Table(name = "transports", schema = "transport")
public class Transport {

    @Id
    private UUID id;

    private String code;

    @Enumerated(EnumType.STRING)
    private TransportStatus status;

    private UUID transporterUserId;

    private UUID minerUserId;

    private UUID collectorUserId;

    private UUID lotId;

    private String lotCode;

    private LocalDate plannedPickupDate;

    private String notes;

    private Instant minerConfirmedAt;

    private Instant collectorConfirmedAt;

    private UUID declinedByUserId;

    private String declineReason;

    private String cancelReason;

    private Instant pickupApprovedAt;

    private Instant handoverConfirmedAt;

    private Double arrivalDistanceKm;

    private boolean locationMismatch;

    private Instant createdAt;

    private Instant updatedAt;

    private Instant completedAt;

    @Version
    private Long version;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JoinColumn(name = "transport_id", nullable = false)
    @OrderBy("receivedAt ASC")
    private List<TransportCheckpoint> checkpoints = new ArrayList<>();

    protected Transport() {
    }

    public static Transport request(String code, UUID transporterUserId, UUID minerUserId, UUID collectorUserId,
            LocalDate plannedPickupDate, String notes, Instant now) {
        Transport t = new Transport();
        t.id = UUID.randomUUID();
        t.code = code;
        t.status = TransportStatus.PENDING_CONFIRMATION;
        t.transporterUserId = transporterUserId;
        t.minerUserId = minerUserId;
        t.collectorUserId = collectorUserId;
        t.plannedPickupDate = plannedPickupDate;
        t.notes = notes;
        t.createdAt = now;
        t.updatedAt = now;
        return t;
    }

    // ---------------------------------------------------------------- confirmation phase

    public void amend(UUID minerUserId, UUID collectorUserId, LocalDate plannedPickupDate, String notes, Instant now) {
        if (status != TransportStatus.PENDING_CONFIRMATION && status != TransportStatus.DECLINED) {
            throw InvalidStateException.of("Transport", status, "amend");
        }
        this.minerUserId = minerUserId;
        this.collectorUserId = collectorUserId;
        this.plannedPickupDate = plannedPickupDate;
        this.notes = notes;
        resetConfirmations();
        status = TransportStatus.PENDING_CONFIRMATION;
        updatedAt = now;
    }

    public void minerConfirm(UUID lotId, String lotCode, Instant now) {
        require(TransportStatus.PENDING_CONFIRMATION, "miner confirmation");
        if (minerConfirmedAt != null) {
            throw new InvalidStateException("ALREADY_CONFIRMED", "The miner has already confirmed");
        }
        this.lotId = lotId;
        this.lotCode = lotCode;
        minerConfirmedAt = now;
        updatedAt = now;
    }

    public void collectorConfirm(Instant now) {
        require(TransportStatus.PENDING_CONFIRMATION, "collector confirmation");
        if (collectorConfirmedAt != null) {
            throw new InvalidStateException("ALREADY_CONFIRMED", "The collector has already confirmed");
        }
        collectorConfirmedAt = now;
        updatedAt = now;
    }

    /** Moves to CONFIRMED once both parties confirmed. Returns true when that happened. */
    public boolean confirmIfComplete(Instant now) {
        if (status == TransportStatus.PENDING_CONFIRMATION && minerConfirmedAt != null && collectorConfirmedAt != null) {
            status = TransportStatus.CONFIRMED;
            updatedAt = now;
            return true;
        }
        return false;
    }

    public void decline(UUID byUserId, String reason, Instant now) {
        require(TransportStatus.PENDING_CONFIRMATION, "decline");
        resetConfirmations();
        declinedByUserId = byUserId;
        declineReason = reason;
        status = TransportStatus.DECLINED;
        updatedAt = now;
    }

    public void cancel(String reason, Instant now) {
        if (!status.isCancellable()) {
            throw InvalidStateException.of("Transport", status, "cancel");
        }
        cancelReason = reason;
        status = TransportStatus.CANCELLED;
        updatedAt = now;
    }

    private void resetConfirmations() {
        lotId = null;
        lotCode = null;
        minerConfirmedAt = null;
        collectorConfirmedAt = null;
        declinedByUserId = null;
        declineReason = null;
    }

    // ---------------------------------------------------------------- journey

    public void depart(TransportCheckpoint cp, Instant now) {
        require(TransportStatus.CONFIRMED, "depart");
        checkpoints.add(cp);
        status = TransportStatus.EN_ROUTE_TO_MINER;
        updatedAt = now;
    }

    public void arriveAtMiner(TransportCheckpoint cp, Double distanceKm, boolean mismatch, Instant now) {
        require(TransportStatus.EN_ROUTE_TO_MINER, "arrive at miner");
        checkpoints.add(cp);
        arrivalDistanceKm = distanceKm;
        locationMismatch = mismatch;
        status = TransportStatus.AT_MINER;
        updatedAt = now;
    }

    public void approvePickup(Instant now) {
        require(TransportStatus.AT_MINER, "approve pickup");
        if (pickupApprovedAt != null) {
            throw new InvalidStateException("ALREADY_APPROVED", "Pickup already approved");
        }
        pickupApprovedAt = now;
        updatedAt = now;
    }

    public void confirmHandover(Instant now) {
        require(TransportStatus.AT_MINER, "confirm handover");
        if (handoverConfirmedAt != null) {
            throw new InvalidStateException("ALREADY_CONFIRMED", "Handover already confirmed");
        }
        handoverConfirmedAt = now;
        updatedAt = now;
    }

    public void pickUp(TransportCheckpoint cp, Instant now) {
        require(TransportStatus.AT_MINER, "pick up");
        if (pickupApprovedAt == null || handoverConfirmedAt == null) {
            throw new InvalidStateException("PICKUP_NOT_AUTHORIZED",
                    "Pickup needs the collector's approval and the miner's handover confirmation");
        }
        checkpoints.add(cp);
        status = TransportStatus.IN_TRANSIT;
        updatedAt = now;
    }

    public void recordLocation(TransportCheckpoint cp, Instant now) {
        if (status != TransportStatus.EN_ROUTE_TO_MINER && status != TransportStatus.IN_TRANSIT) {
            throw InvalidStateException.of("Transport", status, "record location");
        }
        checkpoints.add(cp);
        updatedAt = now;
    }

    public void arriveAtCollector(TransportCheckpoint cp, Instant now) {
        require(TransportStatus.IN_TRANSIT, "arrive at collector");
        checkpoints.add(cp);
        status = TransportStatus.ARRIVED_AT_COLLECTOR;
        updatedAt = now;
    }

    public void receive(Instant now) {
        require(TransportStatus.ARRIVED_AT_COLLECTOR, "receive");
        status = TransportStatus.DELIVERED;
        updatedAt = now;
    }

    public void close(Instant now) {
        require(TransportStatus.DELIVERED, "finalize");
        status = TransportStatus.COMPLETED;
        completedAt = now;
        updatedAt = now;
    }

    private void require(TransportStatus expected, String action) {
        if (status != expected) {
            throw InvalidStateException.of("Transport", status, action);
        }
    }

    // ---------------------------------------------------------------- getters

    public UUID getId() {
        return id;
    }

    public String getCode() {
        return code;
    }

    public TransportStatus getStatus() {
        return status;
    }

    public UUID getTransporterUserId() {
        return transporterUserId;
    }

    public UUID getMinerUserId() {
        return minerUserId;
    }

    public UUID getCollectorUserId() {
        return collectorUserId;
    }

    public UUID getLotId() {
        return lotId;
    }

    public String getLotCode() {
        return lotCode;
    }

    public LocalDate getPlannedPickupDate() {
        return plannedPickupDate;
    }

    public String getNotes() {
        return notes;
    }

    public Instant getMinerConfirmedAt() {
        return minerConfirmedAt;
    }

    public Instant getCollectorConfirmedAt() {
        return collectorConfirmedAt;
    }

    public UUID getDeclinedByUserId() {
        return declinedByUserId;
    }

    public String getDeclineReason() {
        return declineReason;
    }

    public Instant getPickupApprovedAt() {
        return pickupApprovedAt;
    }

    public Instant getHandoverConfirmedAt() {
        return handoverConfirmedAt;
    }

    public Double getArrivalDistanceKm() {
        return arrivalDistanceKm;
    }

    public boolean isLocationMismatch() {
        return locationMismatch;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public List<TransportCheckpoint> getCheckpoints() {
        return checkpoints;
    }

    public boolean involves(UUID userId) {
        return userId.equals(transporterUserId) || userId.equals(minerUserId) || userId.equals(collectorUserId);
    }
}
