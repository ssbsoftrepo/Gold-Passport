-- Demo data for the `local` profile only (never deployed). Sign in with these phones:
--   +51900000001  PMD back office (ADMIN)          -> web app, password pmd-demo-2026
--   +51900000002  Rosa Quispe (MINER)              -> mobile app, PIN 135790
--   +51900000003  Jorge Mamani (TRANSPORTER)       -> mobile app, PIN 135790
--   +51900000004  Planta Aurifera Sur SAC (COLLECTOR) -> web app, PIN 135790
-- The transporter already has approved relationships with the miner and the collector, so a full
-- lot -> transport -> lab -> settlement run can start immediately.

insert into identity.users (id, phone, email, display_name, role, locale, auth_subject, status, created_at, updated_at, version)
values
    ('00000000-0000-0000-0000-000000000001', '+51900000001', 'backoffice@pmd.example', 'PMD Back Office', 'ADMIN', 'es', '00000000-0000-0000-0000-000000000001', 'ACTIVE', now(), now(), 0),
    ('00000000-0000-0000-0000-000000000002', '+51900000002', 'rosa.quispe@example.pe', 'Rosa Quispe', 'MINER', 'es', '00000000-0000-0000-0000-000000000002', 'ACTIVE', now(), now(), 0),
    ('00000000-0000-0000-0000-000000000003', '+51900000003', 'jorge.mamani@example.pe', 'Jorge Mamani', 'TRANSPORTER', 'es', '00000000-0000-0000-0000-000000000003', 'ACTIVE', now(), now(), 0),
    ('00000000-0000-0000-0000-000000000004', '+51900000004', 'compras@plantasur.example.pe', 'Planta Aurifera Sur SAC', 'COLLECTOR', 'es', '00000000-0000-0000-0000-000000000004', 'ACTIVE', now(), now(), 0)
on conflict (id) do nothing;

-- BCrypt hashes of the demo PIN 135790 and the demo staff password pmd-demo-2026.
insert into identity.local_credentials (user_id, secret_hash, updated_at)
values
    ('00000000-0000-0000-0000-000000000001', '$2a$10$oJ8GyQCpQFSc0A0DHgxN3Oh5RvjAnoBbeX1gf0kR5cQn/S.PK3mcq', now()),
    ('00000000-0000-0000-0000-000000000002', '$2a$10$gBmK7H50gTGIoSom3Ly//.vLQFXv6J0SHyxYCjLq2jOSnvZQczJGS', now()),
    ('00000000-0000-0000-0000-000000000003', '$2a$10$gBmK7H50gTGIoSom3Ly//.vLQFXv6J0SHyxYCjLq2jOSnvZQczJGS', now()),
    ('00000000-0000-0000-0000-000000000004', '$2a$10$gBmK7H50gTGIoSom3Ly//.vLQFXv6J0SHyxYCjLq2jOSnvZQczJGS', now())
on conflict (user_id) do nothing;

insert into onboarding.applications (id, user_id, role, status, phone, full_name, document_type, document_number, email,
                                     driver_license_number, vehicle_plate, company_name, ruc, company_address,
                                     legal_representative, kyc_status, kyc_details, review_notes, submitted_at,
                                     reviewed_at, created_at, updated_at, version)
values
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'MINER', 'APPROVED', '+51900000002',
     'Rosa Quispe', 'DNI', '45879632', 'rosa.quispe@example.pe', null, null, null, null, null, null,
     'PASSED', 'Seeded demo participant', 'Seeded', now(), now(), now(), now(), 0),
    ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'TRANSPORTER', 'APPROVED', '+51900000003',
     'Jorge Mamani', 'DNI', '41236587', 'jorge.mamani@example.pe', 'Q41236587', 'ABC-123', null, null, null, null,
     'PASSED', 'Seeded demo participant', 'Seeded', now(), now(), now(), now(), 0),
    ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'COLLECTOR', 'APPROVED', '+51900000004',
     'Carmen Rojas', null, null, 'compras@plantasur.example.pe', null, null, 'Planta Aurifera Sur SAC', '20601234565',
     'Av. Industrial 123, Nazca, Ica', 'Carmen Rojas', 'PASSED', 'Seeded demo participant', 'Seeded', now(), now(), now(), now(), 0)
on conflict (id) do nothing;

insert into relationships.relationships (id, owner_user_id, owner_role, counterparty_role, counterparty_user_id, entity_name,
                                         document_type, document_number, phone, contact_person, status, review_notes,
                                         created_at, updated_at, version)
values
    ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'TRANSPORTER', 'MINER',
     '00000000-0000-0000-0000-000000000002', 'Rosa Quispe', 'DNI', '45879632', '+51900000002', 'Rosa Quispe', 'APPROVED',
     'Seeded', now(), now(), 0),
    ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'TRANSPORTER', 'COLLECTOR',
     '00000000-0000-0000-0000-000000000004', 'Planta Aurifera Sur SAC', 'RUC', '20601234565', '+51900000004', 'Carmen Rojas',
     'APPROVED', 'Seeded', now(), now(), 0),
    ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', 'COLLECTOR', 'MINER',
     '00000000-0000-0000-0000-000000000002', 'Rosa Quispe', 'DNI', '45879632', null, null, 'APPROVED',
     null, now(), now(), 0)
on conflict (id) do nothing;
