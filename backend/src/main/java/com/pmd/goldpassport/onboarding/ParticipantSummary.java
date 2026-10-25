package com.pmd.goldpassport.onboarding;

import java.util.UUID;

import com.pmd.goldpassport.shared.IdDocumentType;
import com.pmd.goldpassport.shared.Role;

/** An approved participant. {@code displayName} is the company name for collectors. */
public record ParticipantSummary(
        UUID userId,
        Role role,
        String displayName,
        IdDocumentType documentType,
        String documentNumber,
        String companyName,
        String ruc) {
}
