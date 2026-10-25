package com.pmd.goldpassport.storage.internal;

import java.util.Optional;

/**
 * Detects the real file type from its first bytes so a renamed executable cannot be stored as
 * "photo.jpg". Only the formats the apps produce are accepted.
 */
final class ContentSniffer {

    private ContentSniffer() {
    }

    static Optional<String> detect(byte[] head, int len) {
        if (len >= 3 && (head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xD8 && (head[2] & 0xFF) == 0xFF) {
            return Optional.of("image/jpeg");
        }
        if (len >= 8 && (head[0] & 0xFF) == 0x89 && head[1] == 'P' && head[2] == 'N' && head[3] == 'G') {
            return Optional.of("image/png");
        }
        if (len >= 5 && head[0] == '%' && head[1] == 'P' && head[2] == 'D' && head[3] == 'F' && head[4] == '-') {
            return Optional.of("application/pdf");
        }
        if (len >= 12 && head[0] == 'R' && head[1] == 'I' && head[2] == 'F' && head[3] == 'F'
                && head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P') {
            return Optional.of("image/webp");
        }
        if (len >= 12 && head[4] == 'f' && head[5] == 't' && head[6] == 'y' && head[7] == 'p') {
            String brand = new String(head, 8, 4, java.nio.charset.StandardCharsets.US_ASCII);
            if (brand.startsWith("hei") || brand.startsWith("hev") || brand.equals("mif1") || brand.equals("msf1")) {
                return Optional.of("image/heic");
            }
        }
        return Optional.empty();
    }

    static String extensionFor(String contentType) {
        return switch (contentType) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "application/pdf" -> ".pdf";
            case "image/webp" -> ".webp";
            case "image/heic" -> ".heic";
            default -> "";
        };
    }
}
