package com.pmd.goldpassport.onboarding.kyc;

import com.pmd.goldpassport.shared.Role;

/** Inputs for identity verification. Images may be {@code null} when not applicable. */
public record KycRequest(
        Role role,
        String declaredDocumentNumber,
        Image idDocument,
        Image selfie,
        Image driverLicense) {

    public record Image(byte[] bytes, String contentType) {

        public boolean isRasterImage() {
            return "image/jpeg".equals(contentType) || "image/png".equals(contentType);
        }
    }
}
