package com.pmd.goldpassport.notifications.push;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Local stub: writes pushes to the log. */
class LoggingPushGateway implements PushGateway {

    private static final Logger log = LoggerFactory.getLogger(LoggingPushGateway.class);

    @Override
    public String register(String token, String platform) {
        return null;
    }

    @Override
    public void send(String token, String platform, String endpointId, String title, String body,
            Map<String, String> data) {
        String shortToken = token.length() > 12 ? token.substring(0, 12) + "..." : token;
        log.info("[push:{}] {} -> {} | {} {}", platform, shortToken, title, body, data);
    }
}
