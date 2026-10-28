package com.pmd.goldpassport.monitoring.internal;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code pmd.metrics.*}
 *
 * @param cloudwatch       where metrics are sent in AWS
 * @param eventsStuckAfter a domain event whose listener has not completed after this long counts as stuck
 */
@ConfigurationProperties(prefix = "pmd.metrics")
public record MetricsProperties(CloudWatch cloudwatch, Duration eventsStuckAfter) {

    /**
     * @param enabled   send metrics to Amazon CloudWatch (needs {@code cloudwatch:PutMetricData})
     * @param namespace CloudWatch namespace, one per environment (e.g. {@code GoldPassport/prod})
     * @param step      how often metrics are sent
     */
    public record CloudWatch(boolean enabled, String namespace, Duration step) {
    }
}
