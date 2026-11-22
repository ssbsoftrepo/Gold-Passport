package com.pmd.goldpassport.monitoring.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import io.micrometer.cloudwatch2.CloudWatchMeterRegistry;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.config.MeterFilterReply;

class CloudWatchMetricsConfigTest {

    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(CloudWatchMetricsConfig.class)
            .withBean(MetricsProperties.class, () -> new MetricsProperties(
                    new MetricsProperties.CloudWatch(true, "GoldPassport/test", Duration.ofMinutes(1)),
                    Duration.ofMinutes(15)))
            .withSystemProperties("aws.region=sa-east-1");

    @Test
    void isOffUnlessEnabled() {
        context.run(ctx -> assertThat(ctx).doesNotHaveBean(CloudWatchMeterRegistry.class));
        context.withPropertyValues("pmd.metrics.cloudwatch.enabled=false")
                .run(ctx -> assertThat(ctx).doesNotHaveBean(CloudWatchMeterRegistry.class));
    }

    @Test
    void sendsToCloudWatchWhenEnabled() {
        context.withPropertyValues("pmd.metrics.cloudwatch.enabled=true")
                .run(ctx -> assertThat(ctx).hasSingleBean(CloudWatchMeterRegistry.class));
    }

    @Test
    void sendsOnlyTheMetricsTheAlarmsUse() {
        assertThat(reply("pmd.aws.calls")).isEqualTo(MeterFilterReply.NEUTRAL);
        assertThat(reply("pmd.events.stuck")).isEqualTo(MeterFilterReply.NEUTRAL);
        assertThat(reply("hikaricp.connections.pending")).isEqualTo(MeterFilterReply.NEUTRAL);
        assertThat(reply("hikaricp.connections.usage")).isEqualTo(MeterFilterReply.DENY);
        assertThat(reply("http.server.requests")).isEqualTo(MeterFilterReply.DENY); // the load balancer has these
        assertThat(reply("jvm.memory.used")).isEqualTo(MeterFilterReply.DENY);
    }

    private static MeterFilterReply reply(String name) {
        return CloudWatchMetricsConfig.SENT.accept(new Meter.Id(name, Tags.empty(), null, null, Meter.Type.GAUGE));
    }
}
