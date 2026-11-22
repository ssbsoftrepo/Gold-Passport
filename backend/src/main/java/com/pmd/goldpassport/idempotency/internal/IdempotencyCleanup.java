package com.pmd.goldpassport.idempotency.internal;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** Deletes remembered keys after {@code pmd.idempotency.retention}. Safe to run on every instance. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
class IdempotencyCleanup {

    private static final Logger log = LoggerFactory.getLogger(IdempotencyCleanup.class);

    private final IdempotencyStore store;
    private final IdempotencyProperties props;
    private final Clock clock;

    IdempotencyCleanup(IdempotencyStore store, IdempotencyProperties props, Clock clock) {
        this.store = store;
        this.props = props;
        this.clock = clock;
    }

    @Scheduled(initialDelayString = "PT5M", fixedDelayString = "PT1H")
    void purgeExpired() {
        int deleted = store.purge(clock.instant().minus(props.retention()));
        if (deleted > 0) {
            log.info("Deleted {} expired idempotency keys", deleted);
        }
    }
}
