package com.pmd.goldpassport.lab.internal;

import java.math.BigDecimal;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code pmd.lab.*}: when the Collector's result differs from the Miner's declaration by more
 * than these tolerances, the lot goes to LAB_DISCREPANCY and PMD mediates.
 *
 * @param purityTolerancePct absolute difference in percentage points (e.g. 0.5 => 92.0 vs 92.6 is a discrepancy)
 * @param weightTolerancePct relative difference in percent of the declared weight
 */
@ConfigurationProperties(prefix = "pmd.lab")
public record LabProperties(BigDecimal purityTolerancePct, BigDecimal weightTolerancePct) {
}
