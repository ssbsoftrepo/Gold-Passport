package com.pmd.goldpassport.storage.internal;

import java.io.InputStream;
import java.nio.file.Path;

/** Port for the blob backend. Implementations: {@link LocalObjectStore}, {@link S3ObjectStore}. */
public interface ObjectStore {

    void put(String key, Path source, String contentType, long sizeBytes);

    InputStream get(String key);
}
