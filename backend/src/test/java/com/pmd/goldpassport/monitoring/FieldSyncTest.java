package com.pmd.goldpassport.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

class FieldSyncTest {

    private static final Instant NOW = Instant.parse("2026-10-28T18:00:00Z");

    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private final FieldSync fieldSync = new FieldSync(registry, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void recordsHowLongWorkWaitedOnThePhone() {
        fieldSync.arrived(FieldSync.PHOTO, NOW.minusSeconds(6 * 3600)); // taken at the mine this morning
        fieldSync.arrived(FieldSync.PHOTO, NOW.minusSeconds(2));

        Timer photos = timer(FieldSync.PHOTO);
        assertThat(photos.count()).isEqualTo(2);
        assertThat(photos.max(TimeUnit.HOURS)).isEqualTo(6);
        assertThat(timer(FieldSync.GPS_STEP)).isNull();
    }

    @Test
    void countsADeviceClockSlightlyAheadAsNoDelay() {
        fieldSync.arrived(FieldSync.GPS_STEP, NOW.plusSeconds(30));
        assertThat(timer(FieldSync.GPS_STEP).totalTime(TimeUnit.SECONDS)).isZero();
    }

    @Test
    void ignoresWorkWithoutADeviceTime() {
        fieldSync.arrived(FieldSync.PHOTO, null);
        assertThat(registry.getMeters()).isEmpty();
    }

    private Timer timer(String kind) {
        return registry.find(FieldSync.METRIC).tag("kind", kind).timer();
    }
}
