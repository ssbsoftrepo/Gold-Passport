package com.pmd.goldpassport.notifications.internal;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.identity.UserAccounts;
import com.pmd.goldpassport.notifications.push.PushGateway;
import com.pmd.goldpassport.shared.NotFoundException;

@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);
    private static final int PAGE = 100;

    private final NotificationRepository notifications;
    private final DeviceTokenRepository devices;
    private final PushGateway push;
    private final MessageSource messages;
    private final UserAccounts users;
    private final ObjectMapper json;
    private final Clock clock;

    public NotificationService(NotificationRepository notifications, DeviceTokenRepository devices, PushGateway push,
            MessageSource messages, UserAccounts users, ObjectMapper json, Clock clock) {
        this.notifications = notifications;
        this.devices = devices;
        this.push = push;
        this.messages = messages;
        this.users = users;
        this.json = json;
        this.clock = clock;
    }

    /**
     * Creates an inbox entry per recipient (in their language) and attempts a push.
     *
     * @param type e.g. {@code transport.REQUESTED}; message keys are {@code notification.<type>.title|body}
     * @param args message arguments: {0} lot code, {1} transport code, {2} extra (reason, amount...)
     */
    @Transactional
    public void notify(Collection<UUID> recipients, String type, Object[] args, Map<String, String> data) {
        Set<UUID> unique = new LinkedHashSet<>();
        for (UUID r : recipients) {
            if (r != null) {
                unique.add(r);
            }
        }
        Instant now = Instant.now(clock);
        String dataJson = toJson(data);
        for (UUID userId : unique) {
            Locale locale = Locale.forLanguageTag(users.localeOf(userId));
            String title = messages.getMessage("notification." + type + ".title", args, "PMD", locale);
            String body = messages.getMessage("notification." + type + ".body", args, type, locale);
            notifications.save(Notification.of(userId, type, title, body, dataJson, now));
            for (DeviceToken d : devices.findByUserId(userId)) {
                try {
                    push.send(d.getToken(), d.getPlatform(), d.getEndpointArn(), title, body, data);
                } catch (RuntimeException e) {
                    log.warn("Push delivery failed for user {}: {}", userId, e.getMessage());
                }
            }
        }
    }

    @Transactional(readOnly = true)
    public List<Notification> list(CurrentUser me, boolean unreadOnly) {
        PageRequest page = PageRequest.of(0, PAGE);
        return unreadOnly
                ? notifications.findByUserIdAndReadAtIsNullOrderByCreatedAtDesc(me.userId(), page)
                : notifications.findByUserIdOrderByCreatedAtDesc(me.userId(), page);
    }

    @Transactional
    public void markRead(CurrentUser me, UUID id) {
        notifications.findByIdAndUserId(id, me.userId())
                .orElseThrow(() -> new NotFoundException("Notification", id))
                .markRead(Instant.now(clock));
    }

    @Transactional
    public void markAllRead(CurrentUser me) {
        notifications.markAllRead(me.userId(), Instant.now(clock));
    }

    @Transactional
    public void registerDevice(CurrentUser me, String token, String platform) {
        Instant now = Instant.now(clock);
        String endpoint = push.register(token, platform);
        devices.findByToken(token).ifPresentOrElse(
                d -> d.reassign(me.userId(), platform, endpoint, now),
                () -> devices.save(DeviceToken.of(me.userId(), token, platform, endpoint, now)));
    }

    @Transactional
    public void unregisterDevice(CurrentUser me, String token) {
        devices.findByToken(token).filter(d -> d.getUserId().equals(me.userId())).ifPresent(devices::delete);
    }

    public Map<String, String> parseData(String data) {
        if (data == null || data.isBlank()) {
            return Map.of();
        }
        try {
            return json.readValue(data, new TypeReference<Map<String, String>>() {
            });
        } catch (JsonProcessingException e) {
            return Map.of();
        }
    }

    private String toJson(Map<String, String> data) {
        try {
            return json.writeValueAsString(data == null ? Map.of() : data);
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }
}
