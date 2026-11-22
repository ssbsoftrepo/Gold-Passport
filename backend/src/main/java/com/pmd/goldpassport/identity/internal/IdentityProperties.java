package com.pmd.goldpassport.identity.internal;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code pmd.auth.*} settings.
 *
 * <p>People sign in with their phone number and a 6-digit PIN (PMD staff: a password of 10+
 * characters). No SMS is ever sent.
 *
 * <ul>
 *   <li>{@code mode=local}: the backend checks the PIN itself (BCrypt) and issues its own HS256 JWTs.
 *       For laptops, CI and demos.</li>
 *   <li>{@code mode=cognito}: clients sign in with Amazon Cognito (phone number + password) and send
 *       the Cognito ID token; the backend validates it against the user pool issuer, and uses the
 *       pool's admin API only to reset a forgotten PIN.</li>
 * </ul>
 */
@ConfigurationProperties(prefix = "pmd.auth")
public record IdentityProperties(
        String mode,
        Local local,
        Cognito cognito,
        /** How long a temporary PIN from a PMD reset can be used (the Cognito pool is set the same). */
        Duration temporaryPinTtl,
        List<String> corsAllowedOrigins) {

    public boolean isLocal() {
        return mode == null || "local".equalsIgnoreCase(mode);
    }

    public Duration temporaryPinTtlOrDefault() {
        return temporaryPinTtl != null ? temporaryPinTtl : Duration.ofDays(7);
    }

    /**
     * @param maxAttempts wrong PINs in a row before the account is locked for {@code lockout}
     */
    public record Local(
            String issuer,
            String jwtSecret,
            Duration tokenTtl,
            int maxAttempts,
            Duration lockout) {
    }

    public record Cognito(String issuerUri, String region, String clientId, String userPoolId) {
    }
}
