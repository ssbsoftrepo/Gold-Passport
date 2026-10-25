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

## Hardening backlog

- Rate limiting at the edge (WAF) for auth and public endpoints.
- Audit log of admin reads (who viewed which KYC document).
- Malware scanning of uploads (e.g. GuardDuty Malware Protection for S3).
- Content Security Policy headers on the web app.
- Dependency scanning (Dependabot / `npm audit` / OWASP dependency-check) in CI.
