# PMD Gold Passport

Traceability for artisanal gold in Peru: every lote is tracked from the mine, through the transporter,
to the Collector/Plant, with PMD (the back office) verifying identities, relationships, lab results
and payments. Each lot gets a tamper-evident **gold passport**: a hash-chained chain of custody that
anyone can verify from the lot code.

| App | Who uses it | Tech |
| --- | --- | --- |
| `backend/` | Everyone, through the apps | Java 21, Spring Boot 3.5 modular monolith (Spring Modulith), PostgreSQL, Flyway |
| `apps/web/` | PMD back office, Collectors/Plants, public passport page | Next.js 16 (React 19, TypeScript) |
| `apps/mobile/` | Miners and Transporters in the field (works offline) | React Native + Expo SDK 58 (TypeScript) |
| `api/openapi.yaml` | The contract between all three | OpenAPI 3.0, single source of truth |

AWS services (Cognito, S3, Rekognition, SNS) sit behind adapters. Locally everything runs without
AWS: OTP codes are logged, files go to disk, KYC is a stub and push notifications are logged.

## Quick start

Prerequisites: Docker, JDK 21 + Maven 3.9 (for backend development), Node 22.

```bash
# Everything in containers: PostgreSQL + API (demo data) + web
docker compose up --build
# web: http://localhost:3000   API + Swagger UI: http://localhost:8080/swagger-ui.html
```

Or run pieces from your IDE / terminal:

```bash
./scripts/dev-backend.sh                    # PostgreSQL in Docker + backend with the `local` profile
cd apps/web && npm install && npm run dev   # http://localhost:3000
cd apps/mobile && npm install && npx expo start   # press "a" for the Android emulator
```

### Demo accounts (`local` profile, OTP code `123456`)

| Phone | Role | Use in |
| --- | --- | --- |
| +51900000001 | PMD back office (ADMIN) | web |
| +51900000002 | Miner, Rosa Quispe | mobile |
| +51900000003 | Transporter, Jorge Mamani | mobile |
| +51900000004 | Collector/Plant, Planta Aurifera Sur SAC | web |

The transporter already has approved relationships with the miner and the plant, so you can run the
whole flow at once: see [docs/local-development.md](docs/local-development.md#demo-walkthrough).

## Documentation

| Read this | For |
| --- | --- |
| [docs/handover.md](docs/handover.md) | Start here: what was built, what was verified, known gaps, first tasks |
| [docs/domain.md](docs/domain.md) | The business flow, state machines and rules (mapped to the four flow diagrams) |
| [docs/architecture.md](docs/architecture.md) | Modules, events, adapters, data model, request lifecycle |
| [docs/api.md](docs/api.md) | Contract-first workflow, conventions, error codes, endpoint map |
| [docs/local-development.md](docs/local-development.md) | Running, testing and debugging locally |
| [docs/deployment-aws.md](docs/deployment-aws.md) | Target AWS architecture and configuration |
| [docs/security.md](docs/security.md) | Authentication, authorization, evidence integrity, data protection |
| [docs/decisions.md](docs/decisions.md) | Architecture decision records |

## Repository layout

```
api/                 openapi.yaml (the contract) + Redocly lint config
backend/             Spring Boot modular monolith (one Java package per module, one DB schema per module)
apps/web/            Next.js back office + Collector/Plant portal + public passport
apps/mobile/         Expo app for Miners and Transporters (offline outbox, camera, GPS)
docs/                Technical documentation
scripts/             Developer scripts (run backend, regenerate API types, lint the contract)
docker-compose.yml   Local stack (PostgreSQL, backend, web, optional LocalStack)
.github/workflows/   CI: contract, backend, web, mobile
```
