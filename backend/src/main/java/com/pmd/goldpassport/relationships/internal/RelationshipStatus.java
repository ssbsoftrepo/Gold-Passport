package com.pmd.goldpassport.relationships.internal;

/**
 * PENDING_REVIEW -> APPROVED
 *                -> CLARIFICATION_REQUESTED -> PENDING_REVIEW (resubmit)
 *                -> REJECTED
 */
public enum RelationshipStatus {
    PENDING_REVIEW,
    CLARIFICATION_REQUESTED,
    APPROVED,
    REJECTED
}
