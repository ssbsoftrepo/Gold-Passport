package com.pmd.goldpassport.lots.internal;

import java.time.Instant;
import java.util.UUID;

import com.pmd.goldpassport.shared.GeoPoint;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * An extraction photo with where and when it was taken. The photo's SHA-256 (computed server-side)
 * is also written into the custody ledger, so a later swap of the file is detectable.
 */
@Entity
@Table(name = "lot_evidence", schema = "lots")
public class LotEvidence {

    @Id
    private UUID id;

    private UUID fileId;

    private String sha256;

    private double latitude;

    private double longitude;

    private Double accuracyMeters;

    /** Device time when the photo was taken (may be earlier than receipt when uploaded offline). */
    private Instant capturedAt;

    private Instant receivedAt;

    protected LotEvidence() {
    }

    static LotEvidence of(UUID fileId, String sha256, GeoPoint point, Double accuracyMeters, Instant capturedAt,
            Instant receivedAt) {
        LotEvidence e = new LotEvidence();
        e.id = UUID.randomUUID();
        e.fileId = fileId;
        e.sha256 = sha256;
        e.latitude = point.latitude();
        e.longitude = point.longitude();
        e.accuracyMeters = accuracyMeters;
        e.capturedAt = capturedAt;
        e.receivedAt = receivedAt;
        return e;
    }

    public GeoPoint point() {
        return new GeoPoint(latitude, longitude);
    }

    public UUID getId() {
        return id;
    }

    public UUID getFileId() {
        return fileId;
    }

    public String getSha256() {
        return sha256;
    }

    public double getLatitude() {
        return latitude;
    }

    public double getLongitude() {
        return longitude;
    }

    public Double getAccuracyMeters() {
        return accuracyMeters;
    }

    public Instant getCapturedAt() {
        return capturedAt;
    }

    public Instant getReceivedAt() {
        return receivedAt;
    }
}
