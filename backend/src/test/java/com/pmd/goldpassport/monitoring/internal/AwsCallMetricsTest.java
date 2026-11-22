package com.pmd.goldpassport.monitoring.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.retry.RetryPolicy;
import software.amazon.awssdk.http.AbortableInputStream;
import software.amazon.awssdk.http.ExecutableHttpRequest;
import software.amazon.awssdk.http.HttpExecuteRequest;
import software.amazon.awssdk.http.HttpExecuteResponse;
import software.amazon.awssdk.http.SdkHttpClient;
import software.amazon.awssdk.http.SdkHttpResponse;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

/**
 * Real S3 clients against a fake HTTP layer: proves the SDK picks the interceptor up from the
 * classpath (no client is configured with it) and classifies AWS's answers.
 */
class AwsCallMetricsTest {

    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();

    @BeforeEach
    void linkRegistry() {
        Metrics.addRegistry(registry);
    }

    @AfterEach
    void unlinkRegistry() {
        Metrics.removeRegistry(registry);
    }

    @ParameterizedTest(name = "HTTP {0} -> {1}")
    @CsvSource({
            "200, ok",
            "403, rejected", // access denied: the task role is missing a permission
            "404, rejected",
            "429, failed", // throttled
            "500, failed",
            "503, failed",
    })
    void classifiesTheAnswer(int status, String outcome) {
        try (S3Client s3 = s3(new FakeHttp(status))) {
            if (status == 200) {
                s3.headBucket(b -> b.bucket("evidence"));
            } else {
                assertThatThrownBy(() -> s3.headBucket(b -> b.bucket("evidence")));
            }
        }

        assertThat(calls("s3", outcome)).isEqualTo(1);
        assertThat(registry.find(AwsCallMetrics.METRIC).timers().stream().mapToLong(Timer::count).sum())
                .as("calls under any outcome").isEqualTo(1);
    }

    @Test
    void countsNoAnswerAsFailed() {
        try (S3Client s3 = s3(new FakeHttp(new IOException("Connection reset")))) {
            assertThatThrownBy(() -> s3.headBucket(b -> b.bucket("evidence")));
        }
        assertThat(calls("s3", "failed")).isEqualTo(1);
    }

    private long calls(String service, String outcome) {
        Timer timer = registry.find(AwsCallMetrics.METRIC).tag("service", service).tag("outcome", outcome).timer();
        return timer == null ? 0 : timer.count();
    }

    private static S3Client s3(SdkHttpClient http) {
        return S3Client.builder()
                .region(Region.US_EAST_1)
                .endpointOverride(URI.create("http://s3.test"))
                .forcePathStyle(true)
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("key", "secret")))
                .httpClient(http)
                .overrideConfiguration(c -> c.retryPolicy(RetryPolicy.none()))
                .build();
    }

    /** Answers every request with one status, or fails like a dropped connection. */
    private static final class FakeHttp implements SdkHttpClient {

        private final int status;
        private final IOException error;

        FakeHttp(int status) {
            this.status = status;
            this.error = null;
        }

        FakeHttp(IOException error) {
            this.status = 0;
            this.error = error;
        }

        @Override
        public ExecutableHttpRequest prepareRequest(HttpExecuteRequest request) {
            return new ExecutableHttpRequest() {
                @Override
                public HttpExecuteResponse call() throws IOException {
                    if (error != null) {
                        throw error;
                    }
                    return HttpExecuteResponse.builder()
                            .response(SdkHttpResponse.builder().statusCode(status).build())
                            .responseBody(AbortableInputStream.create(new ByteArrayInputStream(new byte[0])))
                            .build();
                }

                @Override
                public void abort() {
                }
            };
        }

        @Override
        public void close() {
        }
    }
}
