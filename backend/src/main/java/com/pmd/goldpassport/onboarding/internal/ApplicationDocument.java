package com.pmd.goldpassport.onboarding.internal;

import java.time.Instant;
import java.util.UUID;

import com.pmd.goldpassport.storage.StoredFileInfo;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "application_documents", schema = "onboarding")
public class ApplicationDocument {

    @Id
    private UUID id;

    @Enumerated(EnumType.STRING)
    private DocumentKind kind;

    private UUID fileId;

    private String fileName;

    private String contentType;

    private String sha256;

    private Instant uploadedAt;

    protected ApplicationDocument() {
    }

    static ApplicationDocument of(DocumentKind kind, StoredFileInfo file) {
        ApplicationDocument d = new ApplicationDocument();
        d.id = UUID.randomUUID();
        d.kind = kind;
        d.fileId = file.id();
        d.fileName = file.fileName();
        d.contentType = file.contentType();
        d.sha256 = file.sha256();
        d.uploadedAt = file.uploadedAt();
        return d;
    }

    public UUID getId() {
        return id;
    }

    public DocumentKind getKind() {
        return kind;
    }

    public UUID getFileId() {
        return fileId;
    }

    public String getFileName() {
        return fileName;
    }

    public String getContentType() {
        return contentType;
    }

    public String getSha256() {
        return sha256;
    }

    public Instant getUploadedAt() {
        return uploadedAt;
    }
}
