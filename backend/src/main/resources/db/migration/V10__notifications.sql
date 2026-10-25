create table notifications.notifications (
    id          uuid primary key,
    user_id     uuid         not null,
    type        varchar(80)  not null,
    title       varchar(300) not null,
    body        text         not null,
    data        text         not null default '{}',
    read_at     timestamptz,
    created_at  timestamptz  not null,
    version     bigint       not null default 0
);
create index notifications_user_idx on notifications.notifications (user_id, created_at desc);

create table notifications.device_tokens (
    id            uuid primary key,
    user_id       uuid          not null,
    token         varchar(4096) not null unique,
    platform      varchar(10)   not null,
    endpoint_arn  varchar(500),
    created_at    timestamptz   not null,
    last_seen_at  timestamptz   not null,
    version       bigint        not null default 0
);
create index device_tokens_user_idx on notifications.device_tokens (user_id);
