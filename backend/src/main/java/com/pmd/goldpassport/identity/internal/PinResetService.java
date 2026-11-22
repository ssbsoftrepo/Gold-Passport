package com.pmd.goldpassport.identity.internal;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.shared.InvalidStateException;
import com.pmd.goldpassport.shared.Role;

/** PMD resets the PIN of someone who forgot it. */
@Service
public class PinResetService {

    private static final Logger log = LoggerFactory.getLogger(PinResetService.class);

    private final UserService users;
    private final PinResets resets;

    public PinResetService(UserService users, PinResets resets) {
        this.users = users;
        this.resets = resets;
    }

    public PinResets.TemporaryPin reset(CurrentUser admin, UUID userId) {
        admin.requireRole(Role.ADMIN);
        if (admin.userId().equals(userId)) {
            throw new InvalidStateException("CANNOT_RESET_OWN_PIN", "Change your own password from your profile instead");
        }
        User target = users.get(userId);
        PinResets.TemporaryPin temporary = resets.reset(target);
        // Who reset whose PIN; never the temporary PIN itself.
        log.info("PIN reset for user {} by admin {}; temporary PIN valid until {}", userId, admin.userId(),
                temporary.expiresAt());
        return temporary;
    }
}
