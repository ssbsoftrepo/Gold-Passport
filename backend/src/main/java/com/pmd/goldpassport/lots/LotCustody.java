package com.pmd.goldpassport.lots;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.shared.GeoPoint;

/**
 * Public API of the lots module. Custody changes are synchronous calls (not events) so that the
 * transport/lab/settlement state change and the lot state change commit atomically.
 */
public interface LotCustody {

    /** Storage context for every file attached to a lot (evidence photos, lab reports). */
    String FILE_CONTEXT = "lot";

    LotView get(UUID lotId);

    Optional<LotView> findByCode(String code);

    /** Throws 404/403 unless the user is a participant of the lot or an admin. */
    LotView requireReadable(UUID lotId, CurrentUser user);

    /** Centroid of the GPS coordinates of the extraction photos, if any. */
    Optional<GeoPoint> evidenceCentroid(UUID lotId);

    /** READY_FOR_TRANSPORT -> ASSIGNED_TO_TRANSPORT (miner confirms a transport request). */
    void assignToTransport(UUID lotId, UUID transportId, UUID transporterUserId, UUID collectorUserId, CurrentUser miner);

    /** ASSIGNED_TO_TRANSPORT -> READY_FOR_TRANSPORT (request declined, amended or cancelled before pickup). */
    void releaseFromTransport(UUID lotId, UUID transportId, CurrentUser actor);

    /** ASSIGNED_TO_TRANSPORT -> IN_TRANSIT; custody moves to the transporter. */
    void transferToTransporter(UUID lotId, UUID transportId, CurrentUser transporter);

    /** IN_TRANSIT -> DELIVERED; custody moves to the collector. */
    void transferToCollector(UUID lotId, UUID transportId, CurrentUser collector);

    /** DELIVERED or LAB_DISCREPANCY -> LAB_APPROVED with the verified figures used for settlement. */
    void markLabApproved(UUID lotId, BigDecimal purityPct, BigDecimal weightGrams, CurrentUser actor);

    /** DELIVERED -> LAB_DISCREPANCY. */
    void markLabDiscrepancy(UUID lotId, CurrentUser actor);

    /** LAB_APPROVED -> SETTLED. */
    void markSettled(UUID lotId, CurrentUser actor);
}
