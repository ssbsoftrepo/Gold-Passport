-- Results of POST requests sent with an Idempotency-Key header, so the mobile outbox can repeat a
-- request whose answer was lost on a weak signal without applying it twice (see IdempotencyFilter).
create schema if not exists idempotency;

create table idempotency.request_keys (
    owner                  varchar(100) not null,  -- authenticated user id
    idem_key               varchar(128) not null,
    fingerprint            varchar(500) not null,  -- method and path the key was first used for
    state                  varchar(10)  not null,  -- PENDING while running, COMPLETED with a stored response
    attempt_id             uuid         not null,  -- the attempt that owns the key; a taken-over attempt can no longer finish it
    response_status        integer,
    response_content_type  varchar(200),
    response_body          bytea,
    created_at             timestamptz  not null,
    updated_at             timestamptz  not null,
    primary key (owner, idem_key)
);
create index request_keys_created_idx on idempotency.request_keys (created_at);
