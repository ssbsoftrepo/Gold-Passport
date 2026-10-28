package com.pmd.goldpassport.monitoring.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.pmd.goldpassport.support.PostgresIntegrationTest;

import io.micrometer.core.instrument.MeterRegistry;

class StuckEventsMetricsTest extends PostgresIntegrationTest {

    private static final String LISTENER = "test.StuckEventsMetricsTest";

    @Autowired
    MeterRegistry registry;

    @Autowired
    JdbcTemplate jdbc;

    @AfterEach
    void cleanUp() {
        jdbc.update("delete from event_publication where listener_id = ?", LISTENER);
    }

    @Test
    void countsEventsWhoseListenerHasNotCompletedInTime() {
        double before = stuck();
        Instant now = Instant.now();
        publication(now.minusSeconds(3600), null); // stuck for an hour
        publication(now.minusSeconds(3600), now.minusSeconds(3500)); // completed late, but completed
        publication(now.minusSeconds(60), null); // still within the allowed time

        assertThat(stuck()).isEqualTo(before + 1);
    }

    private double stuck() {
        return registry.get(StuckEventsMetrics.METRIC).gauge().value();
    }

    private void publication(Instant published, Instant completed) {
        jdbc.update("""
                insert into event_publication (id, listener_id, event_type, serialized_event, publication_date, completion_date)
                values (?, ?, 'test.Event', '{}', ?, ?)""",
                UUID.randomUUID(), LISTENER, Timestamp.from(published), completed == null ? null : Timestamp.from(completed));
    }
}
