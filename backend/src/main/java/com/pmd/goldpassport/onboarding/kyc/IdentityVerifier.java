package com.pmd.goldpassport.onboarding.kyc;

/**
 * Port for automated identity checks run after an application is submitted.
 * Implementations: {@link StubIdentityVerifier} (default) and {@link RekognitionIdentityVerifier}
 * ({@code pmd.kyc.provider=aws}). The outcome is advisory; PMD reviewers make the decision.
 */
public interface IdentityVerifier {

    KycOutcome verify(KycRequest request);
}
