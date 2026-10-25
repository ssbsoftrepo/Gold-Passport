-- One PostgreSQL schema per application module. Modules never join across schemas and there are
-- no cross-schema foreign keys: they reference each other by id only, which keeps the option of
-- extracting a module into its own service later.
create schema if not exists identity;
create schema if not exists storage;
create schema if not exists onboarding;
create schema if not exists relationships;
create schema if not exists lots;
create schema if not exists transport;
create schema if not exists lab;
create schema if not exists settlement;
create schema if not exists notifications;
create schema if not exists audit;
