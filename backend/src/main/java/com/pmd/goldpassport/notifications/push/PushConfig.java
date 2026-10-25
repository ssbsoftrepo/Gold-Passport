package com.pmd.goldpassport.notifications.push;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.fasterxml.jackson.databind.ObjectMapper;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.SnsClientBuilder;

@Configuration(proxyBeanMethods = false)
class PushConfig {

    @Bean
    PushGateway pushGateway(PushProperties props, ObjectMapper objectMapper) {
        if ("sns".equalsIgnoreCase(props.provider())) {
            SnsClientBuilder builder = SnsClient.builder();
            if (props.region() != null && !props.region().isBlank()) {
                builder.region(Region.of(props.region()));
            }
            return new SnsPushGateway(builder.build(), props.androidPlatformArn(), props.iosPlatformArn(), objectMapper);
        }
        return new LoggingPushGateway();
    }
}
