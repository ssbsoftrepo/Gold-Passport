package com.pmd.goldpassport.onboarding;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.pmd.goldpassport.shared.DomainEvent;

/** Published on every onboarding state change. */
public record OnboardingEvent(
        Kind kind,
        UUID applicationId,
        UUID applicantUserId,
        String applicantRole,
        UUID actorUserId,
        String actorRole,
        Map<String, Object> details,
        Instant occurredAt) implements DomainEvent {

    public enum Kind {
        SUBMITTED,
        KYC_COMPLETED,
        APPROVED,
        CORRECTIONS_REQUESTED,
        REJECTED
    }

    @Override
    public String eventType() {
        return "onboarding." + kind;
    }

    @Override
    public String aggregateType() {
        return "onboarding";
    }

    @Override
    public UUID aggregateId() {
        return applicationId;
    }

    @Override
    public UUID lotId() {
        return null;
    }
}
