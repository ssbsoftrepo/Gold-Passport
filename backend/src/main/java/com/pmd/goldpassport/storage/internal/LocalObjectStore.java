package com.pmd.goldpassport.storage.internal;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/** Stores blobs on the local filesystem. For development and tests. */
class LocalObjectStore implements ObjectStore {

    private final Path root;

    LocalObjectStore(Path root) {
        this.root = root.toAbsolutePath().normalize();
    }

    @Override
    public void put(String key, Path source, String contentType, long sizeBytes) {
        Path target = resolve(key);
        try {
            Files.createDirectories(target.getParent());
            Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not store " + key, e);
        }
    }

    @Override
    public InputStream get(String key) {
        try {
            return Files.newInputStream(resolve(key));
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read " + key, e);
        }
    }

    private Path resolve(String key) {
        Path p = root.resolve(key).normalize();
        if (!p.startsWith(root)) {
            throw new IllegalArgumentException("Invalid storage key");
        }
        return p;
    }
}
