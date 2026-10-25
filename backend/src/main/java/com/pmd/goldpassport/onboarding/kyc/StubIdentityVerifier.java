package com.pmd.goldpassport.onboarding.kyc;

import java.util.ArrayList;
import java.util.List;

import com.pmd.goldpassport.onboarding.internal.KycStatus;
import com.pmd.goldpassport.shared.Role;

/** Default verifier for local development: reports what was received and asks for manual review. */
class StubIdentityVerifier implements IdentityVerifier {

    @Override
    public KycOutcome verify(KycRequest request) {
        List<String> notes = new ArrayList<>();
        notes.add("Automated checks disabled (pmd.kyc.provider=stub).");
        if (request.role() == Role.COLLECTOR) {
            notes.add("Company: RUC check digit valid; confirm legal documents and SUNAT status manually.");
        } else {
            notes.add("ID document: " + (request.idDocument() != null ? "received" : "missing") + ".");
            if (request.role() == Role.MINER) {
                notes.add("Identity photo: " + (request.selfie() != null ? "received" : "missing") + ".");
            }
            if (request.role() == Role.TRANSPORTER) {
                notes.add("Driver's license: " + (request.driverLicense() != null ? "received" : "missing") + ".");
            }
        }
        return new KycOutcome(KycStatus.NEEDS_REVIEW, String.join(" ", notes));
    }
}
