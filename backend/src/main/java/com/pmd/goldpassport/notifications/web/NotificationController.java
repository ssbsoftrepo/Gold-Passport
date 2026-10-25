package com.pmd.goldpassport.notifications.web;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.notifications.internal.NotificationService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
class NotificationController {

    private final NotificationService notifications;

    NotificationController(NotificationService notifications) {
        this.notifications = notifications;
    }

    record NotificationDto(UUID id, String type, String title, String body, Map<String, String> data, boolean read,
            Instant createdAt) {
    }

    record DeviceRegistration(@NotBlank @Size(max = 4096) String token, @NotBlank @Pattern(regexp = "ANDROID|IOS") String platform) {
    }

    record DeviceUnregistration(@NotBlank String token) {
    }

    @GetMapping("/api/v1/notifications")
    List<NotificationDto> list(CurrentUser me, @RequestParam(defaultValue = "false") boolean unreadOnly) {
        return notifications.list(me, unreadOnly).stream()
                .map(n -> new NotificationDto(n.getId(), n.getType(), n.getTitle(), n.getBody(),
                        notifications.parseData(n.getData()), n.getReadAt() != null, n.getCreatedAt()))
                .toList();
    }

    @PostMapping("/api/v1/notifications/{notificationId}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void markRead(CurrentUser me, @PathVariable UUID notificationId) {
        notifications.markRead(me, notificationId);
    }

    @PostMapping("/api/v1/notifications/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void markAllRead(CurrentUser me) {
        notifications.markAllRead(me);
    }

    @PostMapping("/api/v1/devices")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void register(CurrentUser me, @Valid @RequestBody DeviceRegistration body) {
        notifications.registerDevice(me, body.token(), body.platform());
    }

    @PostMapping("/api/v1/devices/unregister")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void unregister(CurrentUser me, @Valid @RequestBody DeviceUnregistration body) {
        notifications.unregisterDevice(me, body.token());
    }
}
