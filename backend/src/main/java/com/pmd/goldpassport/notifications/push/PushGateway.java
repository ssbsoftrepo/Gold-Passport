package com.pmd.goldpassport.notifications.push;

import java.util.Map;

/**
 * Port for native push delivery. Implementations: {@link LoggingPushGateway} (local) and
 * {@link SnsPushGateway} (Amazon SNS mobile push to FCM/APNs). Delivery is best-effort; the
 * in-app inbox is the source of truth.
 */
public interface PushGateway {

    /** Registers a device token with the provider; returns a provider endpoint id (SNS ARN) or null. */
    String register(String token, String platform);

    void send(String token, String platform, String endpointId, String title, String body, Map<String, String> data);
}
