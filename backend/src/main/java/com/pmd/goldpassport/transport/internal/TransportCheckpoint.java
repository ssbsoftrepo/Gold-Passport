package com.pmd.goldpassport.transport.internal;

import java.time.Instant;
import java.util.UUID;

import com.pmd.goldpassport.shared.GeoPoint;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A GPS reading recorded at a step of the journey. */
@Entity
@Table(name = "checkpoints", schema = "transport")
public class TransportCheckpoint {

    @Id
    private UUID id;

    @Enumerated(EnumType.STRING)
    private CheckpointType type;

    private double latitude;

    private double longitude;

    private Double accuracyMeters;

    /** Device time of the reading. */
    private Instant recordedAt;

    private Instant receivedAt;

    protected TransportCheckpoint() {
    }

    static TransportCheckpoint of(CheckpointType type, GeoPoint point, Double accuracyMeters, Instant recordedAt,
            Instant receivedAt) {
        TransportCheckpoint c = new TransportCheckpoint();
        c.id = UUID.randomUUID();
        c.type = type;
        c.latitude = point.latitude();
        c.longitude = point.longitude();
        c.accuracyMeters = accuracyMeters;
        c.recordedAt = recordedAt;
        c.receivedAt = receivedAt;
        return c;
    }

    public UUID getId() {
        return id;
    }

    public CheckpointType getType() {
        return type;
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

    public Instant getRecordedAt() {
        return recordedAt;
    }

    public Instant getReceivedAt() {
        return receivedAt;
    }
}
