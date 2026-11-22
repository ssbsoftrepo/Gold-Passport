package com.pmd.goldpassport.storage.internal;

import java.io.InputStream;
import java.nio.file.Path;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.ServerSideEncryption;

/**
 * Stores blobs in Amazon S3 with server-side encryption (SSE-KMS when a key is configured).
 * Recommended bucket settings (see docs/deployment-aws.md): versioning, Object Lock in
 * compliance mode for evidence, Block Public Access, and an S3 VPC gateway endpoint.
 */
class S3ObjectStore implements ObjectStore {

    private final S3Client s3;
    private final String bucket;
    private final String kmsKeyId;

    S3ObjectStore(S3Client s3, String bucket, String kmsKeyId) {
        this.s3 = s3;
        this.bucket = bucket;
        this.kmsKeyId = kmsKeyId;
    }

    @Override
    public void put(String key, Path source, String contentType, long sizeBytes) {
        PutObjectRequest.Builder req = PutObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .contentType(contentType)
                .contentLength(sizeBytes);
        if (kmsKeyId != null && !kmsKeyId.isBlank()) {
            req.serverSideEncryption(ServerSideEncryption.AWS_KMS).ssekmsKeyId(kmsKeyId);
        } else {
            req.serverSideEncryption(ServerSideEncryption.AES256);
        }
        s3.putObject(req.build(), RequestBody.fromFile(source));
    }

    @Override
    public InputStream get(String key) {
        return s3.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build());
    }

    /**
     * With versioning this adds a delete marker; under Object Lock the locked version stays (billed)
     * until its retention ends and a lifecycle rule expires it.
     */
    @Override
    public void delete(String key) {
        s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
    }
}
