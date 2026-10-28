package com.pmd.goldpassport.monitoring.internal;

import java.time.Duration;
import java.util.Set;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.micrometer.cloudwatch2.CloudWatchConfig;
import io.micrometer.cloudwatch2.CloudWatchMeterRegistry;
import io.micrometer.core.instrument.Clock;
import io.micrometer.core.instrument.config.MeterFilter;
import software.amazon.awssdk.services.cloudwatch.CloudWatchAsyncClient;

/**
 * Sends metrics to Amazon CloudWatch when {@code pmd.metrics.cloudwatch.enabled=true}. The region
 * and credentials come from the environment (the ECS task role).
 *
 * <p>Only the metrics the alarms and dashboard use are sent ({@link #SENT}): CloudWatch bills per
 * metric, and request counts, latency and 5xx rates already come free from the load balancer.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "pmd.metrics.cloudwatch.enabled", havingValue = "true")
class CloudWatchMetricsConfig {

    /** Our own metrics ({@code pmd.*}) plus the connection pool's. */
    static final MeterFilter SENT = MeterFilter.denyUnless(id -> id.getName().startsWith("pmd.")
            || Set.of("hikaricp.connections.active", "hikaricp.connections.pending", "hikaricp.connections.max",
                    "hikaricp.connections.timeout").contains(id.getName()));

    @Bean(destroyMethod = "close")
    CloudWatchAsyncClient cloudWatchAsyncClient() {
        return CloudWatchAsyncClient.create();
    }

    @Bean
    CloudWatchMeterRegistry cloudWatchMeterRegistry(MetricsProperties props, CloudWatchAsyncClient client) {
        MetricsProperties.CloudWatch cfg = props.cloudwatch();
        CloudWatchConfig config = new CloudWatchConfig() {
            @Override
            public String get(String key) {
                return null;
            }

            @Override
            public String namespace() {
                return cfg.namespace();
            }

            @Override
            public Duration step() {
                return cfg.step();
            }
        };
        CloudWatchMeterRegistry registry = new CloudWatchMeterRegistry(config, Clock.SYSTEM, client);
        registry.config().meterFilter(SENT);
        return registry;
    }
}
