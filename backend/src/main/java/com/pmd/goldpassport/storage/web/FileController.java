package com.pmd.goldpassport.storage.web;

import java.time.Instant;
import java.util.UUID;

import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.storage.StoredFileInfo;
import com.pmd.goldpassport.storage.internal.FileStorageService;

@RestController
class FileController {

    private final FileStorageService storage;

    FileController(FileStorageService storage) {
        this.storage = storage;
    }

    record StoredFile(UUID id, String fileName, String contentType, long sizeBytes, String sha256, Instant uploadedAt) {
    }

    @GetMapping("/api/v1/files/{fileId}")
    StoredFile metadata(CurrentUser me, @PathVariable UUID fileId) {
        StoredFileInfo f = storage.authorize(me, fileId);
        return new StoredFile(f.id(), f.fileName(), f.contentType(), f.sizeBytes(), f.sha256(), f.uploadedAt());
    }

    @GetMapping("/api/v1/files/{fileId}/content")
    ResponseEntity<InputStreamResource> content(CurrentUser me, @PathVariable UUID fileId) {
        StoredFileInfo f = storage.authorize(me, fileId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(f.contentType()))
                .contentLength(f.sizeBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(f.fileName()).build().toString())
                .header("X-Content-SHA256", f.sha256())
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=300")
                .body(new InputStreamResource(storage.open(fileId)));
    }
}
