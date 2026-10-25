package com.pmd.goldpassport.onboarding.kyc;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** {@code pmd.kyc.*}: {@code provider=stub|aws}. */
@ConfigurationProperties(prefix = "pmd.kyc")
public record KycProperties(String provider, String region, float faceSimilarityThreshold) {
}
