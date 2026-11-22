# Architecture decision records

Short records of the choices that shape the codebase. Add a new one when you make a decision that a
new team member would otherwise question.

## ADR-001: Modular monolith with Spring Modulith

**Context.** A small team, one product, a domain with clear sub-areas (onboarding, lots, transport,
lab, payments) and a strong need for transactional consistency between them (custody must never be
ambiguous).

**Decision.** One Spring Boot service, one PostgreSQL database, organised as modules with enforced
boundaries (Spring Modulith `verify()` in the test suite), one DB schema per module, no cross-schema
foreign keys, communication through public API interfaces and domain events.

**Consequences.** Simple to run and deploy; a module can be extracted later (its schema, events and
API are already isolated). Boundary violations fail the build.

## ADR-002: Contract-first API

**Decision.** `api/openapi.yaml` is written by hand and is the source of truth. TypeScript types for
both apps are generated from it; the backend is checked against it by `ApiContractTest`.

**Consequences.** Front-end and back-end teams can work in parallel; breaking changes show up as
type errors. The contract must be updated in the same pull request as the code.

## ADR-003: Synchronous custody calls, asynchronous side effects

**Decision.** State changes that must agree (transport ↔ lot custody, lab ↔ lot, settlement ↔ lot)
are direct calls inside one transaction. Notifications and KYC checks are asynchronous
`@ApplicationModuleListener`s backed by Spring Modulith's event publication registry. The audit
ledger listener is synchronous.

**Consequences.** No distributed consistency problems for the core flow; a slow push provider or
KYC service never blocks or fails a business action.

## ADR-004: Hash-chained ledger in PostgreSQL (not a blockchain or QLDB)

**Context.** The product promise is a verifiable chain of custody. Amazon QLDB has been retired;
public blockchains add cost, latency and privacy problems.

**Decision.** An append-only table with a per-lot SHA-256 hash chain, verified on read, protected by
a trigger and DB permissions, with evidence files hashed and stored under S3 Object Lock.

**Consequences.** Tampering is detectable by anyone who can read the ledger. Rewriting history
undetectably would require rewriting every later hash, which external anchoring of head hashes
(backlog) also rules out.

## ADR-005: AWS behind adapters, local stubs by default

**Decision.** Authentication, object storage, KYC and push are ports with a local implementation
(no AWS needed) and an AWS implementation selected by configuration.

**Consequences.** Laptops and CI run the whole flow offline; AWS code paths need a sandbox account
to test (documented in deployment-aws.md).

## ADR-006: Offline-first field app

**Context.** Mines and roads in Peru often have no mobile data.

**Decision.** Field actions (photos, GPS steps, handover) go through a persistent ordered outbox on
the device; device timestamps are part of the API; GPS is captured on the device (works without
data).

**Consequences.** Actions can reach the server minutes or hours later; the backend accepts
device times within a clock-skew limit and keeps its own receipt time. Business rejections of a
queued action are shown to the user rather than retried.

**Weak signal (amendment).** A weak signal is worse than none: requests hang, or succeed while the
answer is lost. So every request has a deadline (20 s; uploads scale with file size), timeouts and
server errors (5xx, 408, 429) are retried on a backoff timer (10 s doubling to 5 min) as well as when
the network comes back, and each queued action carries an `Idempotency-Key` that the backend uses to
return the first result for a repeat instead of applying it twice. Screens keep their last data on
the device and show when it was saved; the app opens from the cached profile. A 401 pauses the outbox
until the user signs in again rather than failing the queued items.

## ADR-007: Spring Boot 3.5 line

**Context.** Code was written without access to Maven Central, so only APIs known to be stable were
used.

**Decision.** Spring Boot 3.5.x with Spring Modulith 1.4.x and Java 21.

**Consequences.** Spring Boot 3.5 open-source support ends around mid-2026 (check
https://spring.io/projects/spring-boot#support); plan the move to
Spring Boot 4.x / Spring Modulith 2.x early (see handover.md). The modules use only mainstream APIs,
so the upgrade is mostly dependency and package changes (Jackson 3, test annotations).

## ADR-008: Web app is client-rendered against the API

**Decision.** Next.js pages are client components calling the Spring API with the user's token; the
Next.js server only serves the app.

**Consequences.** One source of truth for authorization (the backend); simple mental model.
Server-side rendering of the public passport (for SEO or link previews) is a possible later step.
