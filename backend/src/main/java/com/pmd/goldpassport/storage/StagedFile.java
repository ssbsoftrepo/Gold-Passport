package com.pmd.goldpassport.storage;

import java.time.Instant;
import java.util.UUID;

/**
 * An upload whose bytes are already in the object store but whose metadata is not recorded yet.
 * Produced by {@link FileStorage#withUpload}; recorded with {@link FileStorage#record} inside the
 * caller's transaction.
 */
public record StagedFile(
        UUID id,
        String storageKey,
        String fileName,
        String contentType,
        long sizeBytes,
        String sha256,
        String contextType,
        UUID uploadedBy,
        Instant uploadedAt) {
}
