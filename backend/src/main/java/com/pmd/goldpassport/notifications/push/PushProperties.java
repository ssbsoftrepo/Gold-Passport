package com.pmd.goldpassport.notifications.push;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** {@code pmd.notifications.push.*}: {@code provider=log|sns}. */
@ConfigurationProperties(prefix = "pmd.notifications.push")
public record PushProperties(String provider, String region, String androidPlatformArn, String iosPlatformArn) {
}
