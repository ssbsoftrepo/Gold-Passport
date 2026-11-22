package com.pmd.goldpassport.idempotency.internal;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code pmd.idempotency.*}
 *
 * @param inProgressTimeout how long a request may run before a retry with the same key may take it
 *                          over (covers a server that crashed mid-request)
 * @param retention         how long remembered results are kept; must outlast the time a phone can
 *                          stay offline with an unanswered request in its outbox
 */
@ConfigurationProperties(prefix = "pmd.idempotency")
public record IdempotencyProperties(Duration inProgressTimeout, Duration retention) {
}
