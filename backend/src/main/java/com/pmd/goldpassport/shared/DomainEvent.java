package com.pmd.goldpassport.shared;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Contract every module event implements.
 *
 * <p>The audit module records every {@code DomainEvent} synchronously, in the publishing
 * transaction, into a hash-chained ledger. Events that carry a {@link #lotId()} are chained per
 * lot, which is what makes up a lot's chain of custody ("gold passport").
 */
public interface DomainEvent {

    /** Stable type name, e.g. {@code transport.PICKED_UP}. Used in the ledger and notifications. */
    String eventType();

    /** Aggregate kind, e.g. {@code lot}, {@code transport}. */
    String aggregateType();

    UUID aggregateId();

    /** The lot this event belongs to, or {@code null} when not (yet) linked to a lot. */
    UUID lotId();

    /** Who caused the event; {@code null} for system actions. */
    UUID actorUserId();

    /** Role name of the actor, or {@code SYSTEM}. */
    String actorRole();

    Instant occurredAt();

    /** Extra facts worth keeping in the ledger (GPS, amounts, hashes...). Values must be JSON-friendly. */
    Map<String, Object> details();
}
