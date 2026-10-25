package com.pmd.goldpassport.identity.internal;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code pmd.auth.*} settings.
 *
 * <ul>
 *   <li>{@code mode=local}: the backend issues its own HS256 JWTs after an SMS-style OTP (codes are
 *       logged, never sent). For laptops, CI and demos.</li>
 *   <li>{@code mode=cognito}: clients sign in with Amazon Cognito (passwordless SMS OTP) and send the
 *       Cognito ID token; the backend only validates it against the user pool issuer.</li>
 * </ul>
 */
@ConfigurationProperties(prefix = "pmd.auth")
public record IdentityProperties(
        String mode,
        Local local,
        Cognito cognito,
        List<String> corsAllowedOrigins) {

    public boolean isLocal() {
        return mode == null || "local".equalsIgnoreCase(mode);
    }

    public record Local(
            String issuer,
            String jwtSecret,
            Duration tokenTtl,
            Duration otpTtl,
            String fixedOtp,
            boolean exposeCode,
            int maxAttempts,
            int maxRequestsPerWindow,
            Duration requestWindow) {
    }

    public record Cognito(String issuerUri, String region, String clientId) {
    }
}
