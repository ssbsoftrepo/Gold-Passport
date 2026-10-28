package com.pmd.goldpassport.monitoring.internal;

import java.util.Locale;
import java.util.concurrent.TimeUnit;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.Timer;
import software.amazon.awssdk.core.exception.SdkServiceException;
import software.amazon.awssdk.core.interceptor.Context;
import software.amazon.awssdk.core.interceptor.ExecutionAttribute;
import software.amazon.awssdk.core.interceptor.ExecutionAttributes;
import software.amazon.awssdk.core.interceptor.ExecutionInterceptor;
import software.amazon.awssdk.core.interceptor.SdkExecutionAttribute;

/**
 * Times every AWS SDK call (S3 evidence, SNS push, Rekognition KYC) as {@code pmd.aws.calls},
 * tagged by service and outcome:
 * <ul>
 *   <li>{@code ok};</li>
 *   <li>{@code rejected}: AWS answered no (4xx: access denied, a missing object, a disabled
 *       push endpoint, an unreadable ID photo);</li>
 *   <li>{@code failed}: AWS was unavailable, throttled us, or did not answer (5xx, throttling,
 *       network errors, timeouts), after the SDK's own retries.</li>
 * </ul>
 * The SDK loads it for every client from
 * {@code software/amazon/awssdk/global/handlers/execution.interceptors}, so new AWS adapters are
 * measured without code changes. It records into Micrometer's global registry, which Spring Boot
 * links to the application's registries.
 */
public final class AwsCallMetrics implements ExecutionInterceptor {

    static final String METRIC = "pmd.aws.calls";

    private static final ExecutionAttribute<Long> STARTED = new ExecutionAttribute<>("pmd.aws.calls.started");

    private final MeterRegistry registry;

    /** Used by the AWS SDK. */
    public AwsCallMetrics() {
        this(Metrics.globalRegistry);
    }

    AwsCallMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    @Override
    public void beforeExecution(Context.BeforeExecution context, ExecutionAttributes attributes) {
        attributes.putAttribute(STARTED, System.nanoTime());
    }

    @Override
    public void afterExecution(Context.AfterExecution context, ExecutionAttributes attributes) {
        record(attributes, "ok");
    }

    @Override
    public void onExecutionFailure(Context.FailedExecution context, ExecutionAttributes attributes) {
        record(attributes, outcome(context.exception()));
    }

    static String outcome(Throwable error) {
        if (error instanceof SdkServiceException answer && !answer.isThrottlingException() && answer.statusCode() < 500) {
            return "rejected";
        }
        return "failed";
    }

    private void record(ExecutionAttributes attributes, String outcome) {
        String service = attributes.getAttribute(SdkExecutionAttribute.SERVICE_NAME);
        Long started = attributes.getAttribute(STARTED);
        Timer.builder(METRIC)
                .description("AWS SDK calls by service and outcome")
                .tag("service", service == null ? "unknown" : service.toLowerCase(Locale.ROOT))
                .tag("outcome", outcome)
                .register(registry)
                .record(started == null ? 0 : System.nanoTime() - started, TimeUnit.NANOSECONDS);
    }
}
