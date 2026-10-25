package com.pmd.goldpassport.identity;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.pmd.goldpassport.shared.Role;

/** Public API of the identity module for other modules. */
public interface UserAccounts {

    Optional<UserSummary> find(UUID userId);

    /** Display names for the given users; users without a name are omitted. */
    Map<UUID, String> displayNames(Collection<UUID> userIds);

    List<UUID> userIdsWithRole(Role role);

    void updateDisplayName(UUID userId, String displayName);

    /** Preferred language ({@code es} or {@code en}) for notifications. */
    String localeOf(UUID userId);

    record UserSummary(UUID id, String phone, String displayName, Role role, String locale) {
    }
}
