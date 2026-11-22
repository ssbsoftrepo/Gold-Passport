-- Phase 1 signs people in with their phone number and a 6-digit PIN (PMD staff: a password of
-- 10+ characters). No SMS is sent, so the one-time login codes are gone.
--
-- In Amazon Cognito mode the PIN lives in the Cognito user pool and this table stays empty; it is
-- used by the local mode (laptops, CI, demos), where the backend signs people in itself.
drop table identity.otp_challenges;

create table identity.local_credentials (
    user_id               uuid primary key references identity.users (id),
    -- BCrypt of the PIN or password; never the value itself.
    secret_hash           varchar(100) not null,
    -- Set by a PMD reset: the secret is temporary and must be replaced at the next sign-in.
    must_change           boolean      not null default false,
    temporary_expires_at  timestamptz,
    failed_attempts       integer      not null default 0,
    locked_until          timestamptz,
    updated_at            timestamptz  not null,
    version               bigint       not null default 0
);
