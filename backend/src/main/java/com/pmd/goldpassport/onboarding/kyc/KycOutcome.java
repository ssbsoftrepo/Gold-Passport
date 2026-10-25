package com.pmd.goldpassport.onboarding.kyc;

import com.pmd.goldpassport.onboarding.internal.KycStatus;

public record KycOutcome(KycStatus status, String details) {
}
