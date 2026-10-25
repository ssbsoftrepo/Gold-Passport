package com.pmd.goldpassport.lab;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

/** Public API of the lab module. */
public interface LabQueries {

    /** The verified figures of a lot, once its lab result is approved or its discrepancy resolved. */
    Optional<VerifiedAssay> verifiedAssay(UUID lotId);

    record VerifiedAssay(UUID lotId, BigDecimal purityPct, BigDecimal weightGrams) {
    }
}
