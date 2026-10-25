package com.pmd.goldpassport.identity.internal;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.identity.UserAccounts;
import com.pmd.goldpassport.shared.BadRequestException;
import com.pmd.goldpassport.shared.NotFoundException;
import com.pmd.goldpassport.shared.Role;
import com.pmd.goldpassport.shared.Validators;

@Service
public class UserService implements UserAccounts {

    private final UserRepository users;
    private final Clock clock;

    public UserService(UserRepository users, Clock clock) {
        this.users = users;
        this.clock = clock;
    }

    /**
     * Maps a validated JWT to a platform user. Unknown Cognito subjects are provisioned on first
     * use (matched by phone number when the user was pre-registered, e.g. seeded admins).
     */
    @Transactional
    public User resolveFromToken(String subject, String phoneClaim) {
        Optional<User> bySubject = users.findByAuthSubject(subject);
        if (bySubject.isPresent()) {
            return bySubject.get();
        }
        Instant now = Instant.now(clock);
        String phone = Validators.normalizePhone(phoneClaim);
        if (!Validators.isE164(phone)) {
            throw new BadRequestException("PHONE_CLAIM_MISSING", "Token has no usable phone_number claim");
        }
        User user = users.findByPhone(phone).orElse(null);
        if (user != null) {
            user.linkSubject(subject, now);
            return user;
        }
        return users.save(User.register(phone, subject, now));
    }

    @Transactional
    public User findOrRegisterByPhone(String phone) {
        return users.findByPhone(phone).orElseGet(() -> users.save(User.register(phone, null, Instant.now(clock))));
    }

    @Transactional(readOnly = true)
    public User get(UUID id) {
        return users.findById(id).orElseThrow(() -> new NotFoundException("User", id));
    }

    @Transactional
    public User updateProfile(CurrentUser me, String displayName, String email, String locale) {
        User user = get(me.userId());
        user.updateProfile(displayName, email, locale, Instant.now(clock));
        return user;
    }

    @Transactional
    public User chooseRole(CurrentUser me, Role role) {
        User user = get(me.userId());
        user.chooseRole(role, Instant.now(clock));
        return user;
    }

    @Transactional(readOnly = true)
    public List<User> list(Role role) {
        return role == null ? users.findAllByOrderByCreatedAtDesc() : users.findByRoleOrderByCreatedAtDesc(role);
    }

    // ---------------------------------------------------------------- UserAccounts (module API)

    @Override
    @Transactional(readOnly = true)
    public Optional<UserSummary> find(UUID userId) {
        return users.findById(userId).map(UserService::summary);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, String> displayNames(Collection<UUID> userIds) {
        Map<UUID, String> names = new HashMap<>();
        List<UUID> ids = userIds.stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return names;
        }
        for (User u : users.findByIdIn(ids)) {
            if (u.getDisplayName() != null) {
                names.put(u.getId(), u.getDisplayName());
            }
        }
        return names;
    }

    @Override
    @Transactional(readOnly = true)
    public List<UUID> userIdsWithRole(Role role) {
        return users.findByRole(role).stream().map(User::getId).toList();
    }

    @Override
    @Transactional
    public void updateDisplayName(UUID userId, String displayName) {
        users.findById(userId).ifPresent(u -> u.updateProfile(displayName, null, null, Instant.now(clock)));
    }

    @Override
    @Transactional(readOnly = true)
    public String localeOf(UUID userId) {
        return users.findById(userId).map(User::getLocale).orElse("es");
    }

    private static UserSummary summary(User u) {
        return new UserSummary(u.getId(), u.getPhone(), u.getDisplayName(), u.getRole(), u.getLocale());
    }
}
