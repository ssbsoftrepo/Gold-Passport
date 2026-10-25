package com.pmd.goldpassport.onboarding.internal;

/**
 * DRAFT -> SUBMITTED -> APPROVED
 *                    -> CORRECTIONS_REQUESTED -> SUBMITTED (resubmit)
 *                    -> REJECTED (terminal)
 */
public enum OnboardingStatus {
    DRAFT,
    SUBMITTED,
    CORRECTIONS_REQUESTED,
    APPROVED,
    REJECTED;

    public boolean isEditable() {
        return this == DRAFT || this == CORRECTIONS_REQUESTED;
    }
}
