package com.pmd.goldpassport.storage.internal;

import java.net.URI;
import java.nio.file.Path;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;

/** Picks the blob backend from {@code pmd.storage.provider} ({@code local} or {@code s3}). */
@Configuration(proxyBeanMethods = false)
class StorageConfig {

    @Bean
    ObjectStore objectStore(StorageProperties props) {
        if ("s3".equalsIgnoreCase(props.provider())) {
            StorageProperties.S3 cfg = props.s3();
            if (cfg == null || cfg.bucket() == null || cfg.bucket().isBlank()) {
                throw new IllegalStateException("pmd.storage.s3.bucket is required when pmd.storage.provider=s3");
            }
            S3ClientBuilder builder = S3Client.builder();
            if (cfg.region() != null && !cfg.region().isBlank()) {
                builder.region(Region.of(cfg.region()));
            }
            if (cfg.endpoint() != null && !cfg.endpoint().isBlank()) {
                // LocalStack / MinIO
                builder.endpointOverride(URI.create(cfg.endpoint())).forcePathStyle(true);
            }
            return new S3ObjectStore(builder.build(), cfg.bucket(), cfg.kmsKeyId());
        }
        return new LocalObjectStore(Path.of(props.localDir() == null ? "./data/storage" : props.localDir()));
    }
}
