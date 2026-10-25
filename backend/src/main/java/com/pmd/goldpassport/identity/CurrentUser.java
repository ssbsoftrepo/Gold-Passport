package com.pmd.goldpassport.identity;

import java.util.Arrays;
import java.util.UUID;

import com.pmd.goldpassport.shared.ForbiddenException;
import com.pmd.goldpassport.shared.Role;

/**
 * The authenticated caller. Controllers declare it as a method parameter and it is resolved
 * from the validated JWT (local OTP token or Amazon Cognito token).
 *
 * @param role {@code null} until the user has chosen a role
 */
public record CurrentUser(UUID userId, String phone, Role role) {

    public boolean is(Role r) {
        return role == r;
    }

    public boolean isAdmin() {
        return role == Role.ADMIN;
    }

    /** Throws 403 unless the caller has one of the given roles. Returns {@code this} for chaining. */
    public CurrentUser requireRole(Role... roles) {
        for (Role r : roles) {
            if (role == r) {
                return this;
            }
        }
        throw new ForbiddenException("ROLE_REQUIRED", "This action requires role " + Arrays.toString(roles));
    }

    /** Role name for audit records. */
    public String roleName() {
        return role == null ? "UNASSIGNED" : role.name();
    }
}
