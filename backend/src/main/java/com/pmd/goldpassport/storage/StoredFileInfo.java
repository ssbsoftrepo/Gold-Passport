package com.pmd.goldpassport.storage;

import java.time.Instant;
import java.util.UUID;

/** Metadata of a stored file. {@code sha256} is computed by the server while receiving the bytes. */
public record StoredFileInfo(
        UUID id,
        String fileName,
        String contentType,
        long sizeBytes,
        String sha256,
        String contextType,
        UUID contextId,
        UUID uploadedBy,
        Instant uploadedAt) {
}
