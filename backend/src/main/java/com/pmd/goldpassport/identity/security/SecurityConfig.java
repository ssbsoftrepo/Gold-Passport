package com.pmd.goldpassport.identity.security;

import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtDecoders;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.pmd.goldpassport.identity.internal.IdentityProperties;
import com.pmd.goldpassport.identity.internal.LocalTokenIssuer;

/**
 * Stateless JWT resource server.
 *
 * <ul>
 *   <li>{@code /api/v1/auth/**}, {@code /api/v1/public/**}, health and API docs are public.</li>
 *   <li>{@code /api/v1/admin/**} requires the ADMIN role (PMD back office).</li>
 *   <li>Everything else requires any authenticated user; fine-grained checks (participant of this
 *       lot? approved onboarding?) live in the module services.</li>
 * </ul>
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
class SecurityConfig {

    @Bean
    SecurityFilterChain apiSecurity(HttpSecurity http, JwtDecoder jwtDecoder,
            PmdJwtAuthenticationConverter converter) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                "/api/v1/auth/**",
                                "/api/v1/public/**",
                                "/actuator/health/**",
                                "/actuator/info",
                                "/openapi.yaml",
                                "/v3/api-docs/**",
                                "/swagger-ui/**",
                                "/swagger-ui.html",
                                "/error")
                        .permitAll()
                        .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> oauth
                        .jwt(jwt -> jwt.decoder(jwtDecoder).jwtAuthenticationConverter(converter)));
        return http.build();
    }

    @Bean
    @ConditionalOnProperty(name = "pmd.auth.mode", havingValue = "local", matchIfMissing = true)
    JwtDecoder localJwtDecoder(LocalTokenIssuer issuer) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(issuer.secretKey())
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuer.issuer()));
        return decoder;
    }

    @Bean
    @ConditionalOnProperty(name = "pmd.auth.mode", havingValue = "cognito")
    JwtDecoder cognitoJwtDecoder(IdentityProperties props) {
        // Validates signature (JWKS), expiry and issuer of the Cognito user pool.
        return JwtDecoders.fromIssuerLocation(props.cognito().issuerUri());
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(IdentityProperties props) {
        CorsConfiguration cors = new CorsConfiguration();
        List<String> origins = props.corsAllowedOrigins() == null ? List.of() : props.corsAllowedOrigins();
        cors.setAllowedOriginPatterns(origins);
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept-Language"));
        cors.setExposedHeaders(List.of("Content-Disposition"));
        cors.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        return source;
    }
}
