package com.pmd.goldpassport.lab.internal;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Compares the Collector's measurement with the Miner's declaration. Pure function, unit tested. */
public record AssayComparison(BigDecimal purityDeltaPct, BigDecimal weightDeltaPct, boolean withinTolerance) {

    public static AssayComparison compare(BigDecimal declaredPurity, BigDecimal declaredWeight,
            BigDecimal measuredPurity, BigDecimal measuredWeight, BigDecimal purityTolerance,
            BigDecimal weightTolerancePct) {
        BigDecimal purityDelta = measuredPurity.subtract(declaredPurity).setScale(4, RoundingMode.HALF_UP);
        BigDecimal weightDeltaPct = measuredWeight.subtract(declaredWeight)
                .multiply(BigDecimal.valueOf(100))
                .divide(declaredWeight, 4, RoundingMode.HALF_UP);
        boolean ok = purityDelta.abs().compareTo(purityTolerance) <= 0
                && weightDeltaPct.abs().compareTo(weightTolerancePct) <= 0;
        return new AssayComparison(purityDelta, weightDeltaPct, ok);
    }
}
