create table transport.transports (
    id                      uuid primary key,
    code                    varchar(20)  not null unique,
    status                  varchar(30)  not null,
    transporter_user_id     uuid         not null,
    miner_user_id           uuid         not null,
    collector_user_id       uuid         not null,
    lot_id                  uuid,
    lot_code                varchar(20),
    planned_pickup_date     date,
    notes                   text,
    miner_confirmed_at      timestamptz,
    collector_confirmed_at  timestamptz,
    declined_by_user_id     uuid,
    decline_reason          text,
    cancel_reason           text,
    pickup_approved_at      timestamptz,
    handover_confirmed_at   timestamptz,
    arrival_distance_km     double precision,
    location_mismatch       boolean      not null default false,
    created_at              timestamptz  not null,
    updated_at              timestamptz  not null,
    completed_at            timestamptz,
    version                 bigint       not null default 0
);
create index transports_transporter_idx on transport.transports (transporter_user_id);
create index transports_miner_idx on transport.transports (miner_user_id);
create index transports_collector_idx on transport.transports (collector_user_id);
create index transports_status_idx on transport.transports (status);

create table transport.checkpoints (
    id               uuid primary key,
    transport_id     uuid             not null references transport.transports (id),
    type             varchar(30)      not null,
    latitude         double precision not null,
    longitude        double precision not null,
    accuracy_meters  double precision,
    recorded_at      timestamptz      not null,
    received_at      timestamptz      not null
);
create index checkpoints_transport_idx on transport.checkpoints (transport_id);
