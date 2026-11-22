package com.pmd.goldpassport.identity.internal;

import java.util.regex.Pattern;

import com.pmd.goldpassport.shared.Role;

/**
 * What a new PIN or password must look like. The apps check the same rules before sending, so
 * people see the reason at once; the backend checks again in local mode. (In Cognito mode the pool
 * only enforces a minimum length of 6: the stricter rules are checked by the apps.)
 */
public final class PinRules {

    /** PMD staff can approve people and see everyone's documents: they use a longer password. */
    public static final int STAFF_PASSWORD_MIN_LENGTH = 10;

    private static final Pattern SIX_DIGITS = Pattern.compile("\\d{6}");

    private PinRules() {
    }

    /** A 6-digit PIN that is not all the same digit or a run (123456, 987654, ...). */
    public static boolean isValidPin(String pin) {
        if (pin == null || !SIX_DIGITS.matcher(pin).matches()) {
            return false;
        }
        boolean same = true;
        boolean up = true;
        boolean down = true;
        for (int i = 1; i < pin.length(); i++) {
            int step = pin.charAt(i) - pin.charAt(i - 1);
            same &= step == 0;
            up &= step == 1;
            down &= step == -1;
        }
        return !(same || up || down);
    }

    public static boolean isValidStaffPassword(String password) {
        return password != null && password.length() >= STAFF_PASSWORD_MIN_LENGTH && !password.isBlank();
    }

    /**
     * Whether {@code secret} may be chosen by someone with {@code role}. Staff need a password of 10+
     * characters; everyone else a PIN, or a staff-length password (a future staff member may create
     * their account before PMD gives them the role).
     */
    public static boolean isAllowed(String secret, Role role) {
        if (role == Role.ADMIN) {
            return isValidStaffPassword(secret);
        }
        return isValidPin(secret) || isValidStaffPassword(secret);
    }
}
