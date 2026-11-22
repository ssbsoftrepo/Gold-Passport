# Releasing by phase

The MVP is delivered in phases (the proposal's build plan). A release build shows the features of
its phase and the earlier ones, and hides the rest. Nothing is deleted: hidden screens keep their
code, and the server keeps every endpoint, so the next release is a new build with a higher number.

## Which features ship in which phase

The table lives in `apps/mobile/src/lib/features.ts` and `apps/web/src/lib/features.ts`.

| Phase | Users get | Phone app | Web (plant portal and PMD office) |
| --- | --- | --- | --- |
| 0 | Nothing visible: designs, database, cloud setup | | |
| **1** | **Sign-in, sign-up and PMD approval** | Sign-in with phone number + PIN (no SMS), role, sign-up forms and documents, "pending approval", then "Your account is approved" with what is coming. Inbox and profile. | Plant sign-up. PMD: onboarding review (approve, request corrections) and users, with PIN resets |
| 2 | The miner's batches | Batches: photos with GPS, weight and purity, lab report | PMD: batches |
| 3 | Transport | Partners, trips, pickup and delivery; the miner's Trips tab | Plant: incoming trips and partners. PMD: partner links and trips |
| 4 | Plant, lab and payment | The miner's Payments tab | Plant: overview, received batches, lab check, payments. PMD: lab disagreements and payments |
| 5 | Notifications, admin and go-live | | PMD: overview counts |
| Later (Phase 2 of the product) | Not in the MVP | English, location along the road, the "far from the mine" warning, the field report | English, the public Gold Passport page, automatic ID check results |

In a Phase 1 build:
- the phone app is Spanish only, whatever the phone's language;
- a tab of a later phase disappears; the home tab of an approved miner or transporter shows
  "Your account is approved" and what is coming;
- in the web office, PMD's menu has Onboarding and Users only, and the overview opens Onboarding;
  an approved plant sees "Your account is approved" until its pages are released;
- a link to a hidden page (an old notification, a bookmark) shows "not available yet" instead.

## Building a release

Set the phase when building. Without it, every feature shows (development, demos, the field
trial).

**Phone app:** `EXPO_PUBLIC_RELEASE_PHASE` in the EAS profile. The `production` profile in
`apps/mobile/eas.json` is set to `1`; raise it for each release. The `preview` profile (field
trials) leaves it unset.

```bash
npx eas-cli@latest build --profile production --platform android
```

**Web:** the `NEXT_PUBLIC_RELEASE_PHASE` build argument; Next.js puts it into the page at build time.

```bash
docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.pe \
  --build-arg NEXT_PUBLIC_RELEASE_PHASE=1 -t pmd/gold-passport-web apps/web
```

Build the phone app and the web with the same number.

## What the switch does not do

It hides features in the apps; the server still accepts every call from a signed-in user with the
right role. Someone calling the API directly could, for example, create a batch during Phase 1.
For a real-user release where that matters, the server can refuse the calls of later phases too.
