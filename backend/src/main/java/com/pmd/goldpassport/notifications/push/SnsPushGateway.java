package com.pmd.goldpassport.notifications.push;

import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.model.CreatePlatformEndpointRequest;
import software.amazon.awssdk.services.sns.model.PublishRequest;
import software.amazon.awssdk.services.sns.model.SnsException;

/**
 * Amazon SNS mobile push. Requires one SNS platform application per platform (FCM for Android,
 * APNs for iOS) configured in {@code pmd.notifications.sns.*}.
 */
class SnsPushGateway implements PushGateway {

    private static final Logger log = LoggerFactory.getLogger(SnsPushGateway.class);

    private final SnsClient sns;
    private final String androidPlatformArn;
    private final String iosPlatformArn;
    private final ObjectMapper json;

    SnsPushGateway(SnsClient sns, String androidPlatformArn, String iosPlatformArn, ObjectMapper json) {
        this.sns = sns;
        this.androidPlatformArn = androidPlatformArn;
        this.iosPlatformArn = iosPlatformArn;
        this.json = json;
    }

    @Override
    public String register(String token, String platform) {
        String appArn = "IOS".equalsIgnoreCase(platform) ? iosPlatformArn : androidPlatformArn;
        if (appArn == null || appArn.isBlank()) {
            log.warn("No SNS platform application configured for {}", platform);
            return null;
        }
        try {
            return sns.createPlatformEndpoint(CreatePlatformEndpointRequest.builder()
                    .platformApplicationArn(appArn)
                    .token(token)
                    .build()).endpointArn();
        } catch (SnsException e) {
            log.warn("SNS endpoint registration failed: {}", e.getMessage());
            return null;
        }
    }

    @Override
    public void send(String token, String platform, String endpointId, String title, String body,
            Map<String, String> data) {
        if (endpointId == null) {
            return;
        }
        try {
            Map<String, Object> message = new HashMap<>();
            message.put("default", body);
            if ("IOS".equalsIgnoreCase(platform)) {
                Map<String, Object> aps = Map.of("alert", Map.of("title", title, "body", body), "sound", "default");
                Map<String, Object> apns = new HashMap<>(data);
                apns.put("aps", aps);
                String payload = json.writeValueAsString(apns);
                message.put("APNS", payload);
                message.put("APNS_SANDBOX", payload);
            } else {
                Map<String, Object> fcm = Map.of(
                        "notification", Map.of("title", title, "body", body),
                        "data", data);
                message.put("GCM", json.writeValueAsString(fcm));
            }
            sns.publish(PublishRequest.builder()
                    .targetArn(endpointId)
                    .messageStructure("json")
                    .message(json.writeValueAsString(message))
                    .build());
        } catch (SnsException | JacksonException e) {
            log.warn("SNS push failed: {}", e.getMessage());
        }
    }
}
