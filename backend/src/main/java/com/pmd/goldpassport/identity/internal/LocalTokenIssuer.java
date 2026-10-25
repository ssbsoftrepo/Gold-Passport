package com.pmd.goldpassport.identity.internal;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Component;

import com.nimbusds.jose.jwk.source.ImmutableSecret;

/**
 * Issues HS256 access tokens in local auth mode. In Cognito mode this bean still exists but is
 * never used to issue tokens (the OTP endpoints answer 404).
 */
@Component
public class LocalTokenIssuer {

    private final SecretKey secretKey;
    private final JwtEncoder encoder;
    private final IdentityProperties props;
    private final Clock clock;

    public LocalTokenIssuer(IdentityProperties props, Clock clock) {
        this.props = props;
        this.clock = clock;
        String secret = props.local() != null ? props.local().jwtSecret() : null;
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            if (props.isLocal()) {
                throw new IllegalStateException("pmd.auth.local.jwt-secret must be at least 32 bytes");
            }
            // Cognito mode never issues local tokens; use a throwaway key so nothing can be forged.
            secret = com.pmd.goldpassport.shared.Codes.random(48);
        }
        this.secretKey = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(secretKey));
    }

    public SecretKey secretKey() {
        return secretKey;
    }

    public String issuer() {
        return props.local().issuer();
    }

    public long ttlSeconds() {
        return props.local().tokenTtl().toSeconds();
    }

    public String issue(User user) {
        Instant now = Instant.now(clock);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer())
                .subject(user.getAuthSubject())
                .issuedAt(now)
                .expiresAt(now.plus(props.local().tokenTtl()))
                .claim("phone_number", user.getPhone())
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }
}
