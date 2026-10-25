create table identity.users (
    id            uuid primary key,
    phone         varchar(20)  not null unique,
    email         varchar(200),
    display_name  varchar(200),
    role          varchar(20),
    locale        varchar(5)   not null default 'es',
    auth_subject  varchar(200) not null unique,
    status        varchar(20)  not null default 'ACTIVE',
    created_at    timestamptz  not null,
    updated_at    timestamptz  not null,
    version       bigint       not null default 0,
    constraint users_role_chk check (role is null or role in ('MINER', 'TRANSPORTER', 'COLLECTOR', 'ADMIN')),
    constraint users_status_chk check (status in ('ACTIVE', 'SUSPENDED'))
);
create index users_role_idx on identity.users (role);

create table identity.otp_challenges (
    id           uuid primary key,
    phone        varchar(20) not null,
    code_hash    varchar(64) not null,
    expires_at   timestamptz not null,
    attempts     integer     not null default 0,
    consumed_at  timestamptz,
    created_at   timestamptz not null,
    version      bigint      not null default 0
);
create index otp_challenges_phone_idx on identity.otp_challenges (phone, created_at desc);
