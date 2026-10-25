create table relationships.relationships (
    id                    uuid primary key,
    owner_user_id         uuid         not null,
    owner_role            varchar(20)  not null,
    counterparty_role     varchar(20)  not null,
    counterparty_user_id  uuid,
    entity_name           varchar(200) not null,
    document_type         varchar(10)  not null,
    document_number       varchar(20)  not null,
    phone                 varchar(20),
    contact_person        varchar(200),
    status                varchar(30)  not null,
    review_notes          text,
    reviewer_id           uuid,
    created_at            timestamptz  not null,
    updated_at            timestamptz  not null,
    version               bigint       not null default 0,
    constraint relationships_status_chk check (status in ('PENDING_REVIEW', 'CLARIFICATION_REQUESTED', 'APPROVED', 'REJECTED'))
);
create index relationships_owner_idx on relationships.relationships (owner_user_id);
create index relationships_counterparty_idx on relationships.relationships (counterparty_user_id);
create index relationships_status_idx on relationships.relationships (status);
