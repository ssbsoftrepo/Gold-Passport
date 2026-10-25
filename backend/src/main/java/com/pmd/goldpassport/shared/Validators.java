package com.pmd.goldpassport.shared;

import java.util.regex.Pattern;

/** Validation of Peruvian identifiers and phone numbers. */
public final class Validators {

    private static final Pattern E164 = Pattern.compile("^\\+[1-9]\\d{7,14}$");
    private static final Pattern DNI = Pattern.compile("^\\d{8}$");
    private static final Pattern CE = Pattern.compile("^[A-Za-z0-9]{8,12}$");
    private static final Pattern PASSPORT = Pattern.compile("^[A-Za-z0-9]{6,12}$");
    private static final Pattern RUC = Pattern.compile("^(10|15|16|17|20)\\d{9}$");
    private static final int[] RUC_WEIGHTS = {5, 4, 3, 2, 7, 6, 5, 4, 3, 2};

    private Validators() {
    }

    public static boolean isE164(String phone) {
        return phone != null && E164.matcher(phone).matches();
    }

    /**
     * RUC: 11 digits, valid prefix, and SUNAT modulo-11 check digit.
     * This only proves the number is well formed; a SUNAT lookup is a recommended next step.
     */
    public static boolean isValidRuc(String ruc) {
        if (ruc == null || !RUC.matcher(ruc).matches()) {
            return false;
        }
        int sum = 0;
        for (int i = 0; i < 10; i++) {
            sum += (ruc.charAt(i) - '0') * RUC_WEIGHTS[i];
        }
        int check = 11 - (sum % 11);
        if (check == 10) {
            check = 0;
        } else if (check == 11) {
            check = 1;
        }
        return check == ruc.charAt(10) - '0';
    }

    public static boolean isValidDocument(IdDocumentType type, String number) {
        if (type == null || number == null) {
            return false;
        }
        return switch (type) {
            case DNI -> DNI.matcher(number).matches();
            case CE -> CE.matcher(number).matches();
            case PASSPORT -> PASSPORT.matcher(number).matches();
            case RUC -> isValidRuc(number);
        };
    }

    /** Shows only the last 4 characters, e.g. {@code ****5678}. */
    public static String mask(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        int visible = Math.min(4, trimmed.length());
        return "*".repeat(Math.max(0, trimmed.length() - visible)) + trimmed.substring(trimmed.length() - visible);
    }

    public static String normalizePhone(String phone) {
        return phone == null ? null : phone.replaceAll("[\\s()-]", "");
    }

    public static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
