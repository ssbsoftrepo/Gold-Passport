package com.pmd.goldpassport.storage;

import java.io.InputStream;
import java.util.UUID;

import org.springframework.web.multipart.MultipartFile;

/**
 * Public API of the storage module. Files are evidence: they are content-type sniffed, hashed
 * (SHA-256) on receipt and never overwritten. Backed by the local filesystem or Amazon S3.
 */
public interface FileStorage {

    /**
     * Stores an upload.
     *
     * @param contextType which module/purpose owns the file (see {@link FileAccessPolicy#contextType()})
     * @param contextId   the owning aggregate id (application, lot...)
     */
    StoredFileInfo store(MultipartFile file, String contextType, UUID contextId, UUID uploadedBy);

    StoredFileInfo metadata(UUID fileId);

    InputStream open(UUID fileId);

    /** Reads small files fully into memory (KYC images). */
    byte[] readAllBytes(UUID fileId);
}
