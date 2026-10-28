# Crash and problem reports from the apps

The server's alarms ([monitoring.md](monitoring.md)) cannot see the phones. A crash at a mine, or
photos that never leave a phone, only show up here. Reports go to [Sentry](https://sentry.io) and are
off until a build is given a DSN (the project's address in Sentry).

## What is reported

**Mobile app** (`apps/mobile/src/lib/monitoring.ts`):

| Report | When | Where to look in Sentry |
| --- | --- | --- |
| Crash (JavaScript or native) | The app crashes or a screen throws | Issues; crash-free session rate on the release |
| *The server refused queued field work* (error) | The server rejected an item the phone had queued (a business error, not a lost signal), so it waits in Profile → Pending uploads until the user discards it | Tags `path` (endpoint pattern) and `code` (e.g. `INVALID_STATE`) |
| *Field work is stuck on the phone* (warning) | Work older than 6 hours is still queued after the phone has been online for 15 minutes; at most once a day per phone | Tags `needs_sign_in` (queue paused for a new sign-in), `last_send_error` (`TIMEOUT`, `NO_ANSWER`, an HTTP code); context `outbox` (pending, failed, age in hours) |

With signal, the queue normally empties within a minute or two, so either of the last two means
work is at risk. Ask the user for a field report (Profile → Send field report) for the detail.

**Web app** (`apps/web/src/lib/monitoring.ts`): uncaught errors, and pages that crash while
rendering (`src/app/error.tsx` reports them and offers "Try again" instead of a blank page).

## What is never sent

Reports follow Ley 29733 and hold no personal data:

- no user (name, phone, id), no IP address collection by the SDK, no device name;
- no screenshots, view hierarchy, console output, taps or clicks;
- URLs reduced to their pattern (`/api/v1/lots/:id/photos`): no ids, query strings or fragments;
- no server messages, which may name people (`ApiError` messages are removed; refused work is
  reported by its code only);
- no performance tracing, which would also cost data on a weak signal.

The scrubbing is tested (`monitoring.test.*` in both apps), and was checked end to end with a
production web build against a local stand-in for Sentry.

In the Sentry project settings, also turn on **Data Scrubbing** and **Prevent Storing of IP
Addresses**. Sentry stores data in the US or the EU (chosen when the organization is created) or can
be self-hosted; mention it in the privacy notice as a transfer of technical data.

## Setting it up

1. **Sentry:** create an organization (choose the data region) and two projects: *React Native*
   (`pmd-mobile`) and *React* (`pmd-web`). Each has a DSN.
2. **Mobile:** add the DSN as an EAS environment variable for each environment (a DSN is not a
   secret; it ends up in the app):

   ```bash
   npx eas-cli@latest env:create --name EXPO_PUBLIC_SENTRY_DSN --value "https://…" --environment preview --visibility plaintext
   ```

   Repeat for `production`. `eas.json` sets `EXPO_PUBLIC_SENTRY_ENVIRONMENT` per profile. The
   field trial's `preview` build should have it, so crashes during the trial are reported.
3. **Readable stack traces (mobile):** builds skip uploading source maps
   (`SENTRY_DISABLE_AUTO_UPLOAD` in `eas.json`), so reports show minified code. To upload them,
   create an organization auth token in Sentry, store it as a secret EAS variable
   `SENTRY_AUTH_TOKEN`, add `SENTRY_ORG` and `SENTRY_PROJECT`, and remove
   `SENTRY_DISABLE_AUTO_UPLOAD` from the profile.
4. **Web:** pass the DSN when building the image; Next.js puts it into the browser code at build
   time:

   ```bash
   docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.pe \
     --build-arg NEXT_PUBLIC_SENTRY_DSN=https://… \
     --build-arg NEXT_PUBLIC_SENTRY_ENVIRONMENT=production \
     -t pmd/gold-passport-web apps/web
   ```

5. **Alerts in Sentry:** email (or chat) the same people as the server alarms when:
   - a new issue appears in production;
   - *The server refused queued field work* or *Field work is stuck on the phone* is reported;
   - the mobile release's crash-free session rate drops below 99%.
