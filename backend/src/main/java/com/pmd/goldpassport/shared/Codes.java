package com.pmd.goldpassport.shared;

import java.security.SecureRandom;

/**
 * Human-friendly, unguessable reference codes (Crockford base32: no I, L, O, U).
 * 8 characters = 40 bits of randomness; uniqueness is enforced by database constraints.
 */
public final class Codes {

    private static final char[] ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private Codes() {
    }

    /** Lot code printed on the gold passport / QR, e.g. {@code GP-7KQ29XHD}. */
    public static String lotCode() {
        return "GP-" + random(8);
    }

    /** Transport code, e.g. {@code TR-4M8Q2ZKD}. */
    public static String transportCode() {
        return "TR-" + random(8);
    }

    public static String random(int length) {
        char[] out = new char[length];
        for (int i = 0; i < length; i++) {
            out[i] = ALPHABET[RANDOM.nextInt(ALPHABET.length)];
        }
        return new String(out);
    }
}
