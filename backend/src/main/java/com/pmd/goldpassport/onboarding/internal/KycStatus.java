package com.pmd.goldpassport.onboarding.internal;

/** Result of the automated identity checks. Advisory only: a PMD reviewer always decides. */
public enum KycStatus {
    NOT_RUN,
    PASSED,
    NEEDS_REVIEW,
    FAILED
}
