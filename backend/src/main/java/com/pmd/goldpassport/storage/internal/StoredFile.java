package com.pmd.goldpassport.storage.internal;

import java.time.Instant;
import java.util.UUID;

import com.pmd.goldpassport.storage.StoredFileInfo;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "files", schema = "storage")
public class StoredFile {

    @Id
    private UUID id;

    private String storageKey;

    private String originalFilename;

    private String contentType;

    private long sizeBytes;

    private String sha256;

    private String contextType;

    private UUID contextId;

    private UUID uploadedBy;

    private Instant uploadedAt;

    @Version
    private Long version;

    protected StoredFile() {
    }

    StoredFile(UUID id, String storageKey, String originalFilename, String contentType, long sizeBytes,
            String sha256, String contextType, UUID contextId, UUID uploadedBy, Instant uploadedAt) {
        this.id = id;
        this.storageKey = storageKey;
        this.originalFilename = originalFilename;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.sha256 = sha256;
        this.contextType = contextType;
        this.contextId = contextId;
        this.uploadedBy = uploadedBy;
        this.uploadedAt = uploadedAt;
    }

    public StoredFileInfo toInfo() {
        return new StoredFileInfo(id, originalFilename, contentType, sizeBytes, sha256, contextType, contextId,
                uploadedBy, uploadedAt);
    }

    public String getStorageKey() {
        return storageKey;
    }
}
