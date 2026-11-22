package com.pmd.goldpassport.identity.internal;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;

@Configuration(proxyBeanMethods = false)
class PinResetConfig {

    @Bean
    PinResets pinResets(IdentityProperties props, LocalPinService local, Clock clock) {
        if (props.isLocal()) {
            return local::reset;
        }
        IdentityProperties.Cognito cfg = props.cognito();
        if (cfg == null || cfg.userPoolId() == null || cfg.userPoolId().isBlank()) {
            throw new IllegalStateException("pmd.auth.cognito.user-pool-id is required in cognito mode (PIN resets)");
        }
        var builder = CognitoIdentityProviderClient.builder();
        if (cfg.region() != null && !cfg.region().isBlank()) {
            builder.region(Region.of(cfg.region()));
        }
        return new CognitoPinResets(builder.build(), cfg.userPoolId(), props, clock);
    }
}
