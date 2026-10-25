package com.pmd.goldpassport.lots;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import com.pmd.goldpassport.shared.Role;

/** Read model of a lot shared with other modules. */
public record LotView(
        UUID id,
        String code,
        LotStatus status,
        UUID minerUserId,
        UUID transporterUserId,
        UUID collectorUserId,
        UUID custodianUserId,
        Role custodianRole,
        UUID currentTransportId,
        String mineSiteName,
        BigDecimal declaredWeightGrams,
        BigDecimal declaredPurityPct,
        BigDecimal verifiedWeightGrams,
        BigDecimal verifiedPurityPct,
        int evidenceCount,
        Instant createdAt) {

    /** Miner, assigned transporter and receiving collector may see the lot. */
    public boolean isParticipant(UUID userId) {
        return userId.equals(minerUserId) || userId.equals(transporterUserId) || userId.equals(collectorUserId);
    }
}
