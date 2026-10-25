package com.pmd.goldpassport.onboarding.kyc;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.rekognition.RekognitionClient;
import software.amazon.awssdk.services.rekognition.RekognitionClientBuilder;

@Configuration(proxyBeanMethods = false)
class KycConfig {

    @Bean
    IdentityVerifier identityVerifier(KycProperties props) {
        if ("aws".equalsIgnoreCase(props.provider())) {
            RekognitionClientBuilder builder = RekognitionClient.builder();
            if (props.region() != null && !props.region().isBlank()) {
                builder.region(Region.of(props.region()));
            }
            float threshold = props.faceSimilarityThreshold() > 0 ? props.faceSimilarityThreshold() : 90f;
            return new RekognitionIdentityVerifier(builder.build(), threshold);
        }
        return new StubIdentityVerifier();
    }
}
