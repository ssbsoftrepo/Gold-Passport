package com.pmd.goldpassport.lab.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

class AssayComparisonTest {

    private static final BigDecimal PURITY_TOL = new BigDecimal("0.5");
    private static final BigDecimal WEIGHT_TOL = new BigDecimal("1.0");

    private static AssayComparison compare(String dp, String dw, String mp, String mw) {
        return AssayComparison.compare(new BigDecimal(dp), new BigDecimal(dw), new BigDecimal(mp), new BigDecimal(mw),
                PURITY_TOL, WEIGHT_TOL);
    }

    @Test
    void withinToleranceIsApproved() {
        AssayComparison c = compare("92.5", "150", "92.3", "149.5");
        assertThat(c.withinTolerance()).isTrue();
        assertThat(c.purityDeltaPct()).isEqualByComparingTo("-0.2");
        assertThat(c.weightDeltaPct()).isEqualByComparingTo("-0.3333");
    }

    @Test
    void purityOutsideToleranceIsDiscrepancy() {
        assertThat(compare("92.5", "150", "91.9", "150").withinTolerance()).isFalse();
    }

    @Test
    void weightOutsideToleranceIsDiscrepancy() {
        assertThat(compare("92.5", "150", "92.5", "147").withinTolerance()).isFalse();
    }

    @Test
    void exactlyAtToleranceIsApproved() {
        assertThat(compare("92.5", "100", "93.0", "101").withinTolerance()).isTrue();
    }
}
