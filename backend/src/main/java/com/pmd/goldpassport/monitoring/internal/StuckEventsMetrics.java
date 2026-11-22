package com.pmd.goldpassport.monitoring.internal;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;

/**
 * {@code pmd.events.stuck}: domain events whose listener has not completed after
 * {@code pmd.metrics.events-stuck-after}. Listeners send notifications and push messages
 * (Spring Modulith keeps each event in {@code event_publication} until its listener succeeds), so
 * a number above zero for long means users are not being told about handovers and payments.
 */
@Component
class StuckEventsMetrics implements MeterBinder {

    static final String METRIC = "pmd.events.stuck";

    private static final Logger log = LoggerFactory.getLogger(StuckEventsMetrics.class);

    private final JdbcTemplate jdbc;
    private final MetricsProperties props;
    private final Clock clock;

    StuckEventsMetrics(DataSource dataSource, MetricsProperties props, Clock clock) {
        this.jdbc = new JdbcTemplate(dataSource);
        // The gauge is read on the metrics publishing thread; never hold it up for long.
        this.jdbc.setQueryTimeout(5);
        this.props = props;
        this.clock = clock;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        Gauge.builder(METRIC, this, StuckEventsMetrics::count)
                .description("Domain events whose listener has not completed in time")
                .register(registry);
    }

    double count() {
        try {
            OffsetDateTime before = OffsetDateTime.ofInstant(clock.instant().minus(props.eventsStuckAfter()), ZoneOffset.UTC);
            Long n = jdbc.queryForObject(
                    "select count(*) from event_publication where completion_date is null and publication_date < ?",
                    Long.class, before);
            return n == null ? 0 : n;
        } catch (RuntimeException e) {
            // No value rather than a wrong one; the database alarms cover an unreachable database.
            log.warn("Could not count stuck events: {}", e.toString());
            return Double.NaN;
        }
    }
}
