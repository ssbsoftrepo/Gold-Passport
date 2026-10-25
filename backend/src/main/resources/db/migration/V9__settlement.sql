create table settlement.settlements (
    id                 uuid primary key,
    lot_id             uuid           not null unique,
    lot_code           varchar(20)    not null,
    miner_user_id      uuid           not null,
    collector_user_id  uuid           not null,
    status             varchar(30)    not null,
    amount             numeric(16, 2) not null,
    currency           varchar(3)     not null,
    admin_notes        text,
    validated_by       uuid,
    validated_at       timestamptz,
    payment_reference  varchar(100),
    payment_method     varchar(20),
    payment_notes      text,
    paid_at            timestamptz,
    created_at         timestamptz    not null,
    updated_at         timestamptz    not null,
    version            bigint         not null default 0
);
create index settlements_miner_idx on settlement.settlements (miner_user_id);
create index settlements_collector_idx on settlement.settlements (collector_user_id);
create index settlements_status_idx on settlement.settlements (status);

create table settlement.proposals (
    id               uuid primary key,
    settlement_id    uuid           not null references settlement.settlements (id),
    amount           numeric(16, 2) not null,
    currency         varchar(3)     not null,
    price_per_gram   numeric(14, 4),
    notes            text,
    proposed_by      uuid           not null,
    proposed_at      timestamptz    not null,
    response         varchar(20),
    response_reason  text,
    responded_at     timestamptz
);
create index proposals_settlement_idx on settlement.proposals (settlement_id);
