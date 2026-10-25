package com.pmd.goldpassport.identity.internal;

import java.time.Instant;
import java.util.UUID;

import com.pmd.goldpassport.shared.InvalidStateException;
import com.pmd.goldpassport.shared.Role;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "users", schema = "identity")
public class User {

    @Id
    private UUID id;

    private String phone;

    private String email;

    private String displayName;

    @Enumerated(EnumType.STRING)
    private Role role;

    private String locale;

    /** JWT subject: the user id for local tokens, the Cognito {@code sub} in Cognito mode. */
    private String authSubject;

    @Enumerated(EnumType.STRING)
    private UserStatus status;

    private Instant createdAt;

    private Instant updatedAt;

    @Version
    private Long version;

    protected User() {
    }

    public static User register(String phone, String authSubject, Instant now) {
        User u = new User();
        u.id = UUID.randomUUID();
        u.phone = phone;
        u.authSubject = authSubject != null ? authSubject : u.id.toString();
        u.locale = "es";
        u.status = UserStatus.ACTIVE;
        u.createdAt = now;
        u.updatedAt = now;
        return u;
    }

    public void chooseRole(Role newRole, Instant now) {
        if (newRole == Role.ADMIN) {
            throw new InvalidStateException("ROLE_NOT_ALLOWED", "The ADMIN role cannot be self-assigned");
        }
        if (role != null && role != newRole) {
            throw new InvalidStateException("ROLE_ALREADY_SET", "Role is already set to " + role);
        }
        this.role = newRole;
        this.updatedAt = now;
    }

    public void updateProfile(String displayName, String email, String locale, Instant now) {
        if (displayName != null) {
            this.displayName = displayName.isBlank() ? null : displayName.trim();
        }
        if (email != null) {
            this.email = email.isBlank() ? null : email.trim();
        }
        if (locale != null) {
            this.locale = locale;
        }
        this.updatedAt = now;
    }

    public void linkSubject(String subject, Instant now) {
        this.authSubject = subject;
        this.updatedAt = now;
    }

    public boolean isActive() {
        return status == UserStatus.ACTIVE;
    }

    public UUID getId() {
        return id;
    }

    public String getPhone() {
        return phone;
    }

    public String getEmail() {
        return email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public Role getRole() {
        return role;
    }

    public String getLocale() {
        return locale;
    }

    public String getAuthSubject() {
        return authSubject;
    }

    public UserStatus getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
