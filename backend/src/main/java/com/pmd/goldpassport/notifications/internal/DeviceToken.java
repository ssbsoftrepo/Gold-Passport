package com.pmd.goldpassport.notifications.internal;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/** A native push token (FCM on Android, APNs on iOS) and, in AWS mode, its SNS endpoint ARN. */
@Entity
@Table(name = "device_tokens", schema = "notifications")
public class DeviceToken {

    @Id
    private UUID id;

    private UUID userId;

    private String token;

    private String platform;

    private String endpointArn;

    private Instant createdAt;

    private Instant lastSeenAt;

    @Version
    private Long version;

    protected DeviceToken() {
    }

    static DeviceToken of(UUID userId, String token, String platform, String endpointArn, Instant now) {
        DeviceToken d = new DeviceToken();
        d.id = UUID.randomUUID();
        d.userId = userId;
        d.token = token;
        d.platform = platform;
        d.endpointArn = endpointArn;
        d.createdAt = now;
        d.lastSeenAt = now;
        return d;
    }

    void reassign(UUID userId, String platform, String endpointArn, Instant now) {
        this.userId = userId;
        this.platform = platform;
        if (endpointArn != null) {
            this.endpointArn = endpointArn;
        }
        this.lastSeenAt = now;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getToken() {
        return token;
    }

    public String getPlatform() {
        return platform;
    }

    public String getEndpointArn() {
        return endpointArn;
    }
}
