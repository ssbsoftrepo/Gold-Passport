create table lots.lots (
    id                        uuid primary key,
    code                      varchar(20)    not null unique,
    status                    varchar(30)    not null,
    miner_user_id             uuid           not null,
    mine_site_name            varchar(200)   not null,
    description               text,
    transporter_user_id       uuid,
    collector_user_id         uuid,
    custodian_user_id         uuid           not null,
    custodian_role            varchar(20)    not null,
    current_transport_id      uuid,
    declared_weight_grams     numeric(14, 4),
    declared_purity_pct       numeric(7, 4),
    miner_lab_name            varchar(200),
    miner_lab_report_file_id  uuid,
    miner_lab_reported_at     timestamptz,
    verified_weight_grams     numeric(14, 4),
    verified_purity_pct       numeric(7, 4),
    created_at                timestamptz    not null,
    completed_at              timestamptz,
    updated_at                timestamptz    not null,
    version                   bigint         not null default 0
);
create index lots_miner_idx on lots.lots (miner_user_id);
create index lots_transporter_idx on lots.lots (transporter_user_id);
create index lots_collector_idx on lots.lots (collector_user_id);
create index lots_status_idx on lots.lots (status);

create table lots.lot_evidence (
    id               uuid primary key,
    lot_id           uuid             not null references lots.lots (id),
    file_id          uuid             not null,
    sha256           varchar(64)      not null,
    latitude         double precision not null,
    longitude        double precision not null,
    accuracy_meters  double precision,
    captured_at      timestamptz,
    received_at      timestamptz      not null
);
create index lot_evidence_lot_idx on lots.lot_evidence (lot_id);
