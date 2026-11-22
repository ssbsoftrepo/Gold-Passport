package com.pmd.goldpassport.identity.web;

import java.time.Instant;
import java.util.UUID;

import com.pmd.goldpassport.identity.internal.User;
import com.pmd.goldpassport.shared.Role;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Request/response bodies of the identity endpoints (see api/openapi.yaml). */
final class IdentityDtos {

    private IdentityDtos() {
    }

    record AuthConfig(String mode, String cognitoRegion, String cognitoClientId) {
    }

    /** A 6-digit PIN, or a password of 10+ characters for PMD staff. */
    record PinSignInRequest(@NotBlank String phone, @NotBlank @Size(max = 128) String pin) {
    }

    record NewPinRequest(@NotBlank String phone, @NotBlank @Size(max = 128) String temporaryPin,
            @NotBlank @Size(max = 128) String newPin) {
    }

    record ChangePinRequest(@NotBlank @Size(max = 128) String currentPin, @NotBlank @Size(max = 128) String newPin) {
    }

    record TemporaryPinResponse(String temporaryPin, Instant expiresAt) {
    }

    record TokenResponse(String accessToken, String tokenType, long expiresIn, UserProfile user) {
    }

    record UserProfile(UUID id, String phone, String email, String displayName, Role role, String locale,
            Instant createdAt) {

        static UserProfile of(User u) {
            return new UserProfile(u.getId(), u.getPhone(), u.getEmail(), u.getDisplayName(), u.getRole(),
                    u.getLocale(), u.getCreatedAt());
        }
    }

    record UpdateProfileRequest(
            @Size(max = 200) String displayName,
            @Email @Size(max = 200) String email,
            @Pattern(regexp = "es|en") String locale) {
    }

    record SetRoleRequest(@NotNull Role role) {
    }
}
