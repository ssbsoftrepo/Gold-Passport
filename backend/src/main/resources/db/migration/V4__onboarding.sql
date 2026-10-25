create table onboarding.applications (
    id                     uuid primary key,
    user_id                uuid         not null unique,
    role                   varchar(20)  not null,
    status                 varchar(30)  not null,
    phone                  varchar(20)  not null,
    full_name              varchar(200),
    document_type          varchar(10),
    document_number        varchar(20),
    email                  varchar(200),
    driver_license_number  varchar(30),
    vehicle_plate          varchar(15),
    company_name           varchar(200),
    ruc                    varchar(11),
    company_address        varchar(300),
    legal_representative   varchar(200),
    kyc_status             varchar(20)  not null default 'NOT_RUN',
    kyc_details            text,
    review_notes           text,
    reviewer_id            uuid,
    submitted_at           timestamptz,
    reviewed_at            timestamptz,
    created_at             timestamptz  not null,
    updated_at             timestamptz  not null,
    version                bigint       not null default 0,
    constraint applications_status_chk check (status in ('DRAFT', 'SUBMITTED', 'CORRECTIONS_REQUESTED', 'APPROVED', 'REJECTED'))
);
create index applications_status_idx on onboarding.applications (status, role);
create index applications_document_idx on onboarding.applications (document_number);
create index applications_ruc_idx on onboarding.applications (ruc);

create table onboarding.application_documents (
    id              uuid primary key,
    application_id  uuid         not null references onboarding.applications (id),
    kind            varchar(40)  not null,
    file_id         uuid         not null,
    file_name       varchar(200) not null,
    content_type    varchar(100) not null,
    sha256          varchar(64)  not null,
    uploaded_at     timestamptz  not null
);
create index application_documents_app_idx on onboarding.application_documents (application_id);
