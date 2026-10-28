# Security and data protection

## Authentication

| Mode | How | Where |
| --- | --- | --- |
| `local` | Phone + 6-digit OTP. Codes are stored as SHA-256, expire in 5 minutes, allow 5 attempts, and are rate-limited per phone (5 per 15 minutes). The backend issues an HS256 JWT (12 h). | Laptops, CI, demos. The code is written to the log, never sent. |
| `cognito` | Amazon Cognito passwordless SMS OTP. The apps send the Cognito ID token; the backend validates signature (JWKS), expiry and issuer. | AWS environments |

In both modes the **role comes from the platform database**, never from token claims, so PMD
controls authorization independently of the identity provider. Suspended users
(`identity.users.status = 'SUSPENDED'`) are rejected on every request.

Token storage: mobile keeps it in the OS keystore (`expo-secure-store`). The web keeps it in
`sessionStorage` (cleared when the tab closes). For production, consider a small
backend-for-frontend issuing an httpOnly, `SameSite=Strict` cookie so the token is not readable by
scripts.

## Authorization

Three layers:

1. **URL rules** (`SecurityConfig`): `/api/v1/admin/**` requires `ADMIN`; `/auth/**` and `/public/**`
   are open; the rest needs a valid token.
2. **Role and approval checks** in services: `CurrentUser.requireRole(...)` and
   `ParticipantDirectory.requireApproved(...)` (no lot, relationship or transport actions before PMD
   approves the onboarding).
3. **Participation checks**: only the lot's miner adds photos; only the transport's collector approves
   pickup; only participants (or PMD) read a lot, its ledger, lab result or settlement. Files are
   served only to the uploader, PMD, or users the owning module's `FileAccessPolicy` allows (lot
   files: the lot's participants; KYC documents: the applicant only).

| Action | Miner | Transporter | Collector | PMD |
| --- | --- | --- | --- | --- |
| Review onboarding, relationships | | | | ✓ |
| Create lot, add evidence, declare assay | own lots | | | |
| Register relationships | | ✓ (PMD validates) | ✓ (approved users only) | |
| Request / amend / cancel transport | | own | | |
| Confirm or decline transport | own | | own | |
| Journey steps (GPS) | | own | | |
| Handover | own | | | |
| Approve pickup, receive, lab check, propose / record payment | | | own | |
| Accept / dispute payment | own | | | |
| Resolve lab discrepancy, validate payment | | | | ✓ |
| Read lot, ledger, files | participant | participant | participant | ✓ |
| Public passport | anyone (redacted) | | | |

## Evidence integrity

- **Uploads are sniffed**, not trusted: only JPEG, PNG, HEIC, WEBP and PDF magic bytes are accepted,
  whatever the declared content type or filename (`ContentSniffer`). Size limit 15 MB.
- **Every file is hashed (SHA-256) on receipt**; the hash is stored and, for evidence and lab
  reports, written into the custody ledger. A file swapped later in storage no longer matches.
- **Evidence photos are camera-only** in the mobile app, with device GPS and capture time. The
  server rejects timestamps in the future and records its own receipt time.
- **GPS plausibility**: the transporter's arrival is compared with where the gold was photographed;
  a large distance flags the transport for the plant and PMD.
- **Custody ledger**: hash-chained per lot, written in the same transaction as the business change,
  verified on every read; a database trigger rejects updates and deletes. In AWS, also restrict the
  application DB role to `INSERT, SELECT` on the ledger and enable S3 Object Lock on evidence.

Recommended next steps: Play Integrity / App Attest device attestation on uploads; Rekognition Face
Liveness during onboarding; periodic anchoring of ledger head hashes to an external timestamp
service so even a database administrator cannot rewrite history unnoticed.

## Personal data

Data held: names, phone numbers, emails, DNI/CE/passport and RUC numbers, identity photos and
documents, GPS coordinates, payment amounts and references.

- Identity documents are visible only to the applicant and PMD.
- The directory of participants masks document numbers (`****1234`).
- The public passport shows roles only (no names), approximate locations (2 decimals, about 1 km),
  and no prices.
- Logs never contain tokens or file contents. In `local` mode they contain OTP codes, which is why
  `local` must never run in a shared environment.
- Peru's Ley 29733 (personal data protection) applies: register the database with the national
  authority as required, publish a privacy notice and obtain consent in onboarding, define retention
  periods, and handle access/deletion requests. Evidence under Object Lock cannot be deleted during
  its retention period, so agree that period with legal.

## Dependency vulnerabilities

- **Scan:** `.github/workflows/dependency-scan.yml` checks the web and mobile lockfiles and the
  backend's Maven dependencies (including transitive ones) against the
  [OSV database](https://osv.dev), which includes GitHub's security advisories. It runs on every
  pull request, on `main` and every Monday, because new advisories appear without any code change.
  A known vulnerability fails the check. Locally, `npm audit` in `apps/web` or `apps/mobile` shows
  the same npm findings.
- **Updates:** Dependabot (`.github/dependabot.yml`) opens weekly pull requests with minor and
  patch updates, one per app, plus GitHub Actions and the Docker base images. Major upgrades (an
  Expo SDK, Spring Boot, Next.js) are planned work and are left out. In the repository settings,
  under *Code security*, also turn on **Dependabot alerts** and **Dependabot security updates**.

When the scan fails:

1. Upgrade to a fixed version: `npm update <package>` or `npm audit fix` in the app (never
   `--force`, which can jump major versions), or the version in `backend/pom.xml`. For Expo
   packages, keep to the versions of the current SDK.
2. If no fixed version can be used yet, judge whether the vulnerable code is reachable (in the app
   shipped to phones or in the server, or only in build tools on our own files) and record the
   decision in `osv-scanner.toml`: the advisory id, the reason and an expiry date at most 90 days
   ahead. When it expires the scan fails again and the decision is reviewed.

Accepted today (until 2027-01-26):

| Advisory | Package | Why it stays |
| --- | --- | --- |
| [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (high) | zod 3.25, in `@expo/cli` | Fixed only in zod 4, which the Expo command-line tool does not support; it runs at build time on our own project files, not in the app on phones. Revisit with the next Expo SDK |
| [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) (low) | deepmerge 4.3.1, in `@expo/config` | No fixed version published; it merges our own app config at build time |
| [GHSA-j9f9-w8pj-32f8](https://github.com/advisories/GHSA-j9f9-w8pj-32f8) (critical) | Spring Framework 6.2 `spring-webmvc` | Needs Server-Sent Events with view fragments; the backend is a JSON API with neither. No open-source 6.2 fix; gone with the Spring Boot 4 upgrade (Spring Framework 7.0.9) |
| [GHSA-pc63-qcmh-9cmg](https://github.com/advisories/GHSA-pc63-qcmh-9cmg) (critical) | Spring Framework 6.2 `spring-webmvc` | Needs `XsltView`; the backend renders no views. Same fix as above |

Spring Boot manages most backend versions; `backend/pom.xml` overrides a few (Tomcat, Jackson,
Netty, the PostgreSQL driver, Log4j API, Commons Lang, Commons Compress) where security fixes are
newer than the Spring Boot release. Remove an override once Spring Boot manages the same or newer.

## Hardening backlog

- Rate limiting at the edge (WAF) for auth and public endpoints.
- Audit log of admin reads (who viewed which KYC document).
- Malware scanning of uploads (e.g. GuardDuty Malware Protection for S3).
- Content Security Policy headers on the web app.
- Scanning of the built container images (e.g. Amazon ECR enhanced scanning).
