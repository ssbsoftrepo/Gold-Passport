package com.pmd.goldpassport.notifications.internal;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/** In-app notification (the inbox). Push is best-effort on top of this. */
@Entity
@Table(name = "notifications", schema = "notifications")
public class Notification {

    @Id
    private UUID id;

    private UUID userId;

    private String type;

    private String title;

    private String body;

    /** JSON object of string values used for deep links ({"lotId": "...", "transportId": "..."}). */
    private String data;

    private Instant readAt;

    private Instant createdAt;

    @Version
    private Long version;

    protected Notification() {
    }

    static Notification of(UUID userId, String type, String title, String body, String data, Instant now) {
        Notification n = new Notification();
        n.id = UUID.randomUUID();
        n.userId = userId;
        n.type = type;
        n.title = title;
        n.body = body;
        n.data = data;
        n.createdAt = now;
        return n;
    }

    void markRead(Instant now) {
        if (readAt == null) {
            readAt = now;
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getType() {
        return type;
    }

    public String getTitle() {
        return title;
    }

    public String getBody() {
        return body;
    }

    public String getData() {
        return data;
    }

    public Instant getReadAt() {
        return readAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
