package com.pmd.goldpassport.monitoring;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

/**
 * How long field work waited on the phone before it reached the server: the time between the
 * device's timestamp (a photo's {@code capturedAt}, a GPS step's {@code recordedAt}) and its
 * arrival. Phones queue work while offline, so a few hours is normal at a mine; a delay that
 * keeps growing across users means their queues are not emptying.
 */
@Component
public class FieldSync {

    static final String METRIC = "pmd.field.sync.delay";

    /** A photo of lot evidence. */
    public static final String PHOTO = "photo";

    /** A GPS step of a transport. */
    public static final String GPS_STEP = "gps_step";

    private final MeterRegistry registry;
    private final Clock clock;

    FieldSync(MeterRegistry registry, Clock clock) {
        this.registry = registry;
        this.clock = clock;
    }

    /** Records one item of field work that has just been saved; no-op without a device time. */
    public void arrived(String kind, Instant deviceTime) {
        if (deviceTime == null) {
            return;
        }
        Duration delay = Duration.between(deviceTime, clock.instant());
        Timer.builder(METRIC)
                .description("Time from the device's timestamp to arrival at the server")
                .tag("kind", kind)
                .publishPercentiles(0.5, 0.95)
                .register(registry)
                // A device clock slightly ahead (within the accepted skew) counts as no delay.
                .record(delay.isNegative() ? Duration.ZERO : delay);
    }
}
