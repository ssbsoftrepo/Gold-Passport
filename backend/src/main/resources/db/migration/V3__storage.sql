create table storage.files (
    id                 uuid primary key,
    storage_key        varchar(400) not null unique,
    original_filename  varchar(200) not null,
    content_type       varchar(100) not null,
    size_bytes         bigint       not null,
    sha256             varchar(64)  not null,
    context_type       varchar(50)  not null,
    context_id         uuid         not null,
    uploaded_by        uuid         not null,
    uploaded_at        timestamptz  not null,
    version            bigint       not null default 0
);
create index files_context_idx on storage.files (context_type, context_id);
