package com.pmd.goldpassport.storage;

import java.io.InputStream;
import java.util.UUID;
import java.util.function.Function;

import org.springframework.web.multipart.MultipartFile;

/**
 * Public API of the storage module. Files are evidence: they are content-type sniffed, hashed
 * (SHA-256) on receipt and never overwritten. Backed by the local filesystem or Amazon S3.
 */
public interface FileStorage {

    /**
     * Uploads a file, then runs {@code work} in a new database transaction, which records the file
     * with {@link #record} next to the change it belongs to.
     *
     * <p>The upload (to S3 in production) happens before the transaction starts, so no pooled database
     * connection waits on it. If {@code work} or its commit fails, the uploaded bytes are deleted again
     * (unless the metadata row turns out to exist), so failed requests leave no orphaned objects.
     * Must be called outside any transaction.
     *
     * @param contextType which module/purpose owns the file (see {@link FileAccessPolicy#contextType()})
     */
    <T> T withUpload(MultipartFile file, String contextType, UUID uploadedBy, Function<StagedFile, T> work);

    /**
     * Records the metadata of a staged upload in the current transaction (required).
     *
     * @param contextId the owning aggregate id (application, lot...)
     */
    StoredFileInfo record(StagedFile staged, UUID contextId);

    StoredFileInfo metadata(UUID fileId);

    InputStream open(UUID fileId);

    /** Reads small files fully into memory (KYC images). */
    byte[] readAllBytes(UUID fileId);
}
