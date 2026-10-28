package com.pmd.goldpassport.storage.internal;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.shared.BadRequestException;
import com.pmd.goldpassport.shared.ForbiddenException;
import com.pmd.goldpassport.shared.Hashing;
import com.pmd.goldpassport.shared.NotFoundException;
import com.pmd.goldpassport.storage.FileAccessPolicy;
import com.pmd.goldpassport.storage.FileStorage;
import com.pmd.goldpassport.storage.StagedFile;
import com.pmd.goldpassport.storage.StoredFileInfo;

/**
 * Object store I/O (S3 in production) never runs inside a database transaction: a transaction holds
 * one of the few pooled connections for its whole duration, so a slow upload or download there would
 * block other requests. Metadata is read and written in short transactions around it.
 */
@Service
public class FileStorageService implements FileStorage {

    private static final Logger log = LoggerFactory.getLogger(FileStorageService.class);

    private static final DateTimeFormatter KEY_DATE = DateTimeFormatter.ofPattern("yyyy/MM").withZone(ZoneOffset.UTC);

    private final StoredFileRepository files;
    private final ObjectStore objectStore;
    private final StorageProperties props;
    private final List<FileAccessPolicy> policies;
    private final Clock clock;
    private final TransactionTemplate tx;

    public FileStorageService(StoredFileRepository files, ObjectStore objectStore, StorageProperties props,
            List<FileAccessPolicy> policies, Clock clock, PlatformTransactionManager transactions) {
        this.files = files;
        this.objectStore = objectStore;
        this.props = props;
        this.policies = policies;
        this.clock = clock;
        this.tx = new TransactionTemplate(transactions);
    }

    @Override
    public <T> T withUpload(MultipartFile upload, String contextType, UUID uploadedBy,
            Function<StagedFile, T> work) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("withUpload must be called outside a transaction");
        }
        StagedFile staged = stage(upload, contextType, uploadedBy);
        try {
            return tx.execute(status -> work.apply(staged));
        } catch (RuntimeException | Error e) {
            discard(staged);
            throw e;
        }
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public StoredFileInfo record(StagedFile staged, UUID contextId) {
        StoredFile file = new StoredFile(staged.id(), staged.storageKey(), staged.fileName(), staged.contentType(),
                staged.sizeBytes(), staged.sha256(), staged.contextType(), contextId, staged.uploadedBy(),
                staged.uploadedAt());
        return files.save(file).toInfo();
    }

    /**
     * Deletes the bytes of an upload whose transaction did not commit. If the metadata row exists after
     * all (a commit that failed only on the way back), or the database cannot be asked, the bytes are
     * kept: an orphaned object is better than evidence that points at nothing.
     */
    private void discard(StagedFile staged) {
        try {
            if (files.existsById(staged.id())) {
                return;
            }
            objectStore.delete(staged.storageKey());
        } catch (RuntimeException e) {
            log.warn("Could not remove orphaned upload {}", staged.storageKey(), e);
        }
    }

    /** Validates, hashes and uploads the bytes; records nothing in the database. */
    private StagedFile stage(MultipartFile upload, String contextType, UUID uploadedBy) {
        if (upload == null || upload.isEmpty()) {
            throw new BadRequestException("FILE_EMPTY", "A non-empty file is required");
        }
        if (props.maxFileSize() != null && upload.getSize() > props.maxFileSize().toBytes()) {
            throw new BadRequestException("FILE_TOO_LARGE", "File exceeds " + props.maxFileSize());
        }
        Path temp = null;
        try {
            temp = Files.createTempFile("pmd-upload-", ".bin");
            MessageDigest digest = Hashing.sha256Digest();
            byte[] head = new byte[16];
            int headLen;
            try (InputStream in = new DigestInputStream(upload.getInputStream(), digest);
                    OutputStream out = Files.newOutputStream(temp)) {
                headLen = in.readNBytes(head, 0, head.length);
                out.write(head, 0, headLen);
                in.transferTo(out);
            }
            String contentType = ContentSniffer.detect(head, headLen)
                    .orElseThrow(() -> new BadRequestException("FILE_TYPE_NOT_ALLOWED",
                            "Only JPEG, PNG, HEIC, WEBP images and PDF documents are accepted"));
            long size = Files.size(temp);
            String sha256 = HexFormat.of().formatHex(digest.digest());
            Instant now = Instant.now(clock);
            UUID id = UUID.randomUUID();
            String key = contextType + "/" + KEY_DATE.format(now) + "/" + id + ContentSniffer.extensionFor(contentType);
            objectStore.put(key, temp, contentType, size);
            return new StagedFile(id, key, sanitize(upload.getOriginalFilename(), contentType), contentType, size,
                    sha256, contextType, uploadedBy, now);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not store upload", e);
        } finally {
            if (temp != null) {
                try {
                    Files.deleteIfExists(temp);
                } catch (IOException ignored) {
                    // temp files are cleaned by the OS eventually
                }
            }
        }
    }

    @Override
    @Transactional(readOnly = true)
    public StoredFileInfo metadata(UUID fileId) {
        return find(fileId).toInfo();
    }

    /** Not transactional: the metadata lookup is its own short transaction, the download runs outside it. */
    @Override
    public InputStream open(UUID fileId) {
        return objectStore.get(find(fileId).getStorageKey());
    }

    @Override
    public byte[] readAllBytes(UUID fileId) {
        try (InputStream in = open(fileId)) {
            return in.readAllBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Admins and the uploader may always read; otherwise the owning module's policy decides. */
    @Transactional(readOnly = true)
    public StoredFileInfo authorize(CurrentUser user, UUID fileId) {
        StoredFileInfo info = metadata(fileId);
        if (user.isAdmin() || user.userId().equals(info.uploadedBy())) {
            return info;
        }
        Optional<FileAccessPolicy> policy = policies.stream()
                .filter(p -> p.contextType().equals(info.contextType()))
                .findFirst();
        if (policy.isPresent() && policy.get().canRead(user, info.contextId())) {
            return info;
        }
        throw new ForbiddenException("FILE_ACCESS_DENIED", "You cannot access this file");
    }

    private StoredFile find(UUID fileId) {
        return files.findById(fileId).orElseThrow(() -> new NotFoundException("File", fileId));
    }

    private static String sanitize(String name, String contentType) {
        if (name == null || name.isBlank()) {
            return "file" + ContentSniffer.extensionFor(contentType);
        }
        String base = Path.of(name).getFileName().toString().replaceAll("[^A-Za-z0-9._-]", "_");
        return base.length() > 120 ? base.substring(base.length() - 120) : base;
    }
}
