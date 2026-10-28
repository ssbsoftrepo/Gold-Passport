# Local development

## Prerequisites

| Tool | Version | For |
| --- | --- | --- |
| Docker (with Compose) | recent | PostgreSQL, full local stack, Testcontainers in tests |
| JDK | 21 | backend |
| Maven | 3.9+ | backend build (no wrapper is committed; `mvn -N wrapper:wrapper` adds one) |
| Node.js | 22 | web and mobile |
| Android Studio emulator or a phone with a development build | | mobile |

## Option A: everything in Docker

```bash
docker compose up --build
```

- Web: <http://localhost:3000>
- API: <http://localhost:8080>, Swagger UI: <http://localhost:8080/swagger-ui.html>
- Health: <http://localhost:8080/actuator/health>

The backend runs with the `local` profile: demo data is seeded and the OTP code is always `123456`
(it is also returned by the API and pre-filled by the apps).

## Option B: run from your IDE

```bash
docker compose up -d postgres
mvn -f backend/pom.xml spring-boot:run -Dspring-boot.run.profiles=local   # or ./scripts/dev-backend.sh
```

In IntelliJ: open `backend/pom.xml` as a project, run `GoldPassportApplication` with active profile
`local`.

Web:

```bash
cd apps/web
cp .env.example .env.local      # NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
npm install
npm run dev
```

Mobile:

```bash
cd apps/mobile
cp .env.example .env            # Android emulator reaches your machine at 10.0.2.2
npm install
npx expo start                  # press "a" for Android
```

On a physical phone, set `EXPO_PUBLIC_API_BASE_URL=http://<your computer's LAN IP>:8080`.
Camera, GPS and secure storage work in Expo Go; native push notifications need a development build
(`npx eas-cli build --profile development`) because Expo Go cannot provide FCM/APNs device tokens.

## Demo walkthrough

Uses the seeded accounts (OTP `123456`). The transporter already has approved relationships.

1. **Mobile, miner `+51900000002`**: Lots → New lot → name the socavón → Take extraction photo
   (allow camera and location) → Close lot → Laboratory check: enter lab, purity `92.5`, weight
   `150`, attach any PDF or photo → Save. The lot is now *Ready for transport*.
2. **Mobile, transporter `+51900000003`**: Transports → New transport → pick Rosa Quispe and
   Planta Aurifera Sur SAC → Send request.
3. **Mobile, miner**: Transports → choose the lot → Confirm and assign lot.
4. **Web, plant `+51900000004`**: Incoming transports → Approve planned receipt. The transport is
   *Confirmed*.
5. **Mobile, transporter**: open the transport → Leave for the mine → I arrived at the mine.
   (In the emulator, set a location close to where the photo was taken, or the arrival is flagged.)
6. **Web, plant**: Approve pickup. **Mobile, miner**: Transports → Hand the gold to the transporter.
7. **Mobile, transporter**: Pick up the gold → I arrived at the plant.
8. **Web, plant**: Mark mineral as received → Received lots → open the lot → Record lab check
   (purity `92.3`, weight `149.5`, any file) → Propose amount.
9. **Mobile, miner**: Payments → Accept amount (or Dispute to see the renegotiation).
10. **Web, PMD `+51900000001`**: Payments → Decision → Validate amount.
11. **Web, plant**: record the payment reference. The lot is *Settled*.
12. Open `http://localhost:3000/passport/<lot code>` in a private window: the public passport with
    the verified chain of custody.

To try onboarding and PMD review, log in with any new number (for example `+51911111111`), choose a
role and follow the screens; then approve it as PMD under *Identity checks*.

To try offline mode: in the emulator, turn on airplane mode, take an extraction photo or record a
transport step, then turn networking back on. The item appears under Profile → Pending uploads and
is sent automatically. Screens you opened before keep showing their data, with the time it was saved.

To try a weak signal: in the Android emulator's *Extended controls → Cellular*, set *Network type*
to GSM or EDGE and *Signal strength* to Poor (or start it with `-netdelay gprs -netspeed gsm`).
Requests then time out instead of hanging, and queued items are retried every 10 s, backing off to
5 min, until they get through. Repeats are safe: the outbox sends an `Idempotency-Key`, so an upload
whose answer was lost is not stored twice.

## Tests

```bash
mvn -f backend/pom.xml verify
```

| Test | What it checks |
| --- | --- |
| `ModularityTest` | Module boundaries and no cycles (Spring Modulith); writes module diagrams to `target/spring-modulith-docs` |
| `ApiContractTest` | Every path and method in `api/openapi.yaml` is implemented, and nothing else is |
| `EndToEndFlowTest` | The full business flow over HTTP against a real PostgreSQL: onboarding of three roles with a correction round, relationships, lot with GPS evidence, transport with a decline and amendment, hand-offs, lab check, payment dispute and validation, ledger verification, public passport, async notifications, append-only trigger and tamper detection |
| `*StateMachineTest`, `AssayComparisonTest`, `HashChainTest`, `ValidatorsTest`, `GeoPointTest` | Unit tests of the domain rules |

Integration tests start PostgreSQL with Testcontainers (Docker required). Without Docker, point them
at an empty database you own:

```bash
export PMD_TEST_DB_URL=jdbc:postgresql://localhost:5432/goldpassport_test
export PMD_TEST_DB_USERNAME=goldpassport PMD_TEST_DB_PASSWORD=goldpassport
mvn -f backend/pom.xml verify
```

Front ends:

```bash
cd apps/web && npm run typecheck && npm run lint && npm test && npm run build
cd apps/mobile && npm run typecheck && npx eslint src && npm test && npx expo export --platform android
```

The app tests run without a backend, a device or an emulator. Mobile uses Jest (`jest-expo`) with
in-memory stand-ins for device storage, files and connectivity (`apps/mobile/src/test`); web uses
Vitest with jsdom and a fake API that records every request (`apps/web/src/test/server.ts`).
Tests sit next to the code in `__tests__` folders.

| Test | What it checks |
| --- | --- |
| mobile `outbox.test.tsx` | The offline outbox: sends at once with signal; queues without; replays in order with each item's original idempotency key; stops at the first unanswered item so nothing overtakes it; marks business errors failed and carries on; backoff from 10 s doubling to 5 min; retries on reconnect and app foreground; pauses on an expired session and resumes on sign-in; keeps its own photo copies and deletes them once sent; survives a restart and cleans up orphaned copies |
| mobile `api.test.ts` | Request deadlines (including the longer upload deadline), which errors are retried, problem-detail mapping, auth and idempotency headers |
| mobile `cache.test.ts`, `hooks.test.tsx` | Saved screen data: the 40-entry limit, sign-out clearing it (also for loads still in flight), saved data first then fresh data, the newest reload winning |
| web `LotPanels.test.tsx` | The collector's lab check and payment panels: who may do what in which lot state, the Peruvian decimal comma, what is sent to the API, server errors |
| `i18n.test.ts`, `format.test.ts` (both apps) | Every text exists in Spanish and English with the same placeholders, every key a screen uses exists, number and money formats |

These tests prove the logic; they do not replace trying the app on real phones with a poor signal
(see the field trial plan in [handover.md](handover.md)).

## Trying the AWS adapters locally (LocalStack)

```bash
docker compose --profile aws up -d localstack     # creates s3://pmd-evidence-local
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_REGION=us-east-1 \
PMD_STORAGE_PROVIDER=s3 PMD_S3_BUCKET=pmd-evidence-local PMD_S3_ENDPOINT=http://localhost:4566 \
mvn -f backend/pom.xml spring-boot:run -Dspring-boot.run.profiles=local
```

Rekognition and Cognito are not emulated by LocalStack's free tier; test them against a sandbox AWS
account.

## Useful things to know

- **Reset the local database**: `docker compose down -v` (drops the `pgdata` volume).
- **OTP codes** in non-local profiles are printed in the backend log: `[local-auth] OTP for ... is ...`.
- **Push notifications** locally are printed as `[push:ANDROID] ...` in the backend log; every
  notification is also in the in-app inbox.
- **Uploaded files** live in `./data/storage` (or the `storage` Docker volume).
- **Adding a module**: create `com.pmd.goldpassport.<module>` with its public API in the base
  package and the rest in `internal`/`web`, add a Flyway migration that creates its schema and
  tables, and run `ModularityTest`.
- **Changing the API**: see [api.md](api.md#contract-first).
