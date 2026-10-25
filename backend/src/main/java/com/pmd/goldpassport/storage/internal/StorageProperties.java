package com.pmd.goldpassport.storage.internal;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.unit.DataSize;

/**
 * {@code pmd.storage.*}: {@code provider=local} writes under {@code localDir};
 * {@code provider=s3} uses {@code s3.bucket} (optionally a custom endpoint for LocalStack/MinIO).
 */
@ConfigurationProperties(prefix = "pmd.storage")
public record StorageProperties(String provider, String localDir, DataSize maxFileSize, S3 s3) {

    public record S3(String bucket, String region, String endpoint, String kmsKeyId) {
    }
}
