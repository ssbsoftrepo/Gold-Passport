package com.pmd.goldpassport.onboarding.internal;

import com.pmd.goldpassport.shared.IdDocumentType;

/** Partial update: {@code null} keeps the current value, an empty string clears it. */
public record OnboardingChanges(
        String fullName,
        IdDocumentType documentType,
        String documentNumber,
        String email,
        String driverLicenseNumber,
        String vehiclePlate,
        String companyName,
        String ruc,
        String companyAddress,
        String legalRepresentative) {
}
