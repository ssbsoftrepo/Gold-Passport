package com.pmd.goldpassport.onboarding;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.shared.Role;

/**
 * Public API of the onboarding module: the registry of KYC-approved participants. Other modules
 * use it to gate actions ("only approved users may create lots") and to resolve partners.
 */
public interface ParticipantDirectory {

    boolean isApproved(UUID userId);

    /** Throws 403 {@code ONBOARDING_NOT_APPROVED} unless the caller is approved (admins pass). */
    void requireApproved(CurrentUser user);

    Optional<ParticipantSummary> findApproved(UUID userId);

    /** Matches an approved participant of the given role by document number or RUC. */
    Optional<ParticipantSummary> findApprovedByDocument(Role role, String documentNumber);

    List<ParticipantSummary> search(Role role, String query);
}
