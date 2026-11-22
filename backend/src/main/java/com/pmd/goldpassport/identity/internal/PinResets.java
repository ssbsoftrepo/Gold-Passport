package com.pmd.goldpassport.identity.internal;

import java.time.Instant;

/** Gives someone who forgot their PIN a temporary one (no SMS: PMD tells them in person or by phone). */
public interface PinResets {

    /** @param value shown once to the PMD staff member; never stored or logged in clear */
    record TemporaryPin(String value, Instant expiresAt) {
    }

    TemporaryPin reset(User target);
}
