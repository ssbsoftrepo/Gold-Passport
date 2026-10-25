# Handover

Read this first. It says what exists, how confident you can be in each part, and what to do in the
first weeks.

## What was built

A working end-to-end implementation of the four PMD flows (Miner, Transport, Collector/Plant, gold
purity pipeline):

- **Backend** (`backend/`): Spring Boot 3.5 modular monolith with 12 modules, 71 REST endpoints,
  PostgreSQL schema per module (Flyway), hash-chained custody ledger, async notifications with a
  durable outbox, AWS adapters (Cognito, S3, Rekognition, SNS) with local stubs, demo data.
- **Web** (`apps/web/`): PMD back office (identity checks, relationships, lots, transports, lab
  discrepancies, payment validation, users), Collector/Plant portal (company onboarding, incoming
  transports, lab check, payment), public gold passport page. Spanish and English.
- **Mobile** (`apps/mobile/`): Miner and Transporter app with onboarding (camera capture of
  documents), lots with geotagged camera-only evidence, transport journey with GPS steps, payments,
  inbox, and an offline outbox. Spanish and English.
- **Contract** (`api/openapi.yaml`), CI workflow, Docker Compose stack, documentation.

How the diagrams were reconciled into one model, including every judgement call, is in
[domain.md](domain.md) (look for **Decision**).

## Verification status

Be precise about this when planning the first sprint.

| Part | Verified | How |
| --- | --- | --- |
| API contract | ✅ | Redocly lint passes |
| Database migrations and seed | ✅ | Applied to PostgreSQL 16 |
| Web app | ✅ | Type check, ESLint and `next build` pass; screens reviewed against a mock API |
| Mobile app | ✅ (static) | Type check and ESLint pass; Android JS bundle exports; login screen rendered via web export. Not yet run on a device |
| Contract ↔ backend endpoints | ✅ | All 71 operations match (scripted check; `ApiContractTest` enforces it in CI) |
| Contract ↔ backend DTO field names | ✅ | Scripted comparison of every schema with its Java record |
| Backend Java syntax and internal references | ✅ | `javac` parse check and cross-reference check of the project's own types |
| **Backend compile, tests and startup** | ❌ **not run** | The build environment had no access to Maven Central, so Spring and other dependencies could not be downloaded. The code uses only mainstream, stable APIs, but expect a small number of compile or wiring fixes on the first `mvn verify`. |
| AWS adapters (Cognito, S3, Rekognition, SNS) | ❌ not run | Need a sandbox AWS account; see deployment-aws.md |

**First action for the team:** run `mvn -B -f backend/pom.xml verify` (Docker running) and fix
whatever comes up. The `EndToEndFlowTest` exercises the entire business flow over HTTP, so once it
passes, the backend and the contract the apps rely on are proven together.

## Code tour (30 minutes)

1. `api/openapi.yaml`: skim the paths; this is what the apps can do.
2. `backend/.../lots/internal/Lot.java` and `transport/internal/Transport.java`: the state machines.
3. `backend/.../transport/internal/TransportService.java`: a typical service (actor checks, entity
   call, custody call, event).
4. `backend/.../audit/internal/LedgerService.java` and `HashChain.java`: the chain of custody.
5. `backend/.../notifications/internal/NotificationListeners.java`: who hears about what.
6. `backend/src/test/.../EndToEndFlowTest.java`: the whole story in one test.
7. `apps/web/src/components/LotPanels.tsx`: collector lab and payment UI.
8. `apps/mobile/src/lib/outbox.tsx` and `src/app/transport/[transportId].tsx`: offline field flow.

## Known gaps and recommended next steps

Ordered by priority.

**Weeks 1-2: make it real**

1. Backend: first `mvn verify`, fix compile/wiring issues, run the demo walkthrough end to end with
   the web and mobile apps on an emulator.
2. Upgrade path: Spring Boot 3.5 open-source support ends around mid-2026; plan Spring Boot 4 /
   Spring Modulith 2 (Jackson 3, moved test annotations). Add the Maven wrapper (`mvn -N wrapper:wrapper`).
3. Infrastructure as code (CDK or Terraform) for the architecture in deployment-aws.md; a staging
   environment with Cognito, S3 and SNS; validate the Cognito passwordless flow in both apps.
4. Mobile: development build on real Android phones used in the field (low-end devices, poor
   signal); validate the offline outbox, camera and GPS accuracy at a real mine site.

**Before pilot**

5. Pagination for admin lists (all lists are capped/unpaged today) and a database search for the
   participant directory (currently filtered in memory, fine for thousands, not for more).
6. RENIEC (DNI) and SUNAT (RUC) lookups through a Peruvian provider; Rekognition Face Liveness in
   onboarding.
7. Device integrity (Play Integrity / App Attest) on evidence uploads.
8. Legal: privacy notice and consent (Ley 29733), evidence retention period, terms for plants.
9. Observability: structured logs, CloudWatch alarms, a dashboard of lots by status.

**Product questions to confirm with the business**

- Should Collector-created relationships also be validated by PMD? (Today: approved at once.)
- Who resolves lab discrepancies: PMD only (today), or the plant and miner with PMD as escalation?
- Is the plant's lab always the reference for payment (today), or an average / third-party lab?
- Should the minimum number of extraction photos per lot be higher than 1
  (`pmd.lots.min-photos`)?
- Is a lot always transported whole, or can it be split across transports?
- What is the location-mismatch threshold that should alert PMD (today 5 km)?

## Where things are configured

| What | Where |
| --- | --- |
| Backend settings, tolerances, adapters | `backend/src/main/resources/application.yml` (`pmd.*`) |
| Local profile (demo data, fixed OTP) | `application-local.yml`, `db/dev/R__dev_seed.sql` |
| Notification texts | `backend/src/main/resources/i18n/messages*.properties` |
| Web texts | `apps/web/src/lib/i18n.tsx` |
| Mobile texts | `apps/mobile/src/lib/i18n.tsx` |
| Web design tokens | `apps/web/src/app/globals.css` |
| Mobile design tokens | `apps/mobile/src/lib/theme.ts` |
| Mobile build profiles | `apps/mobile/eas.json`, `app.json` |
