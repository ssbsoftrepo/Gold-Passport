# Field trial plan

Automated tests prove the app's logic; only real phones at a real mine prove it works for miners
and transporters. This plan covers a first trial: a few days, one or two mine sites, a handful of
users, on the staging environment. Run it before any pilot with real gold.

The thresholds marked *proposed* are starting points: agree them with the business before the trial,
so the result is a clear go or no-go.

## What the trial must show

| # | Question | Pass when (*proposed*) |
| --- | --- | --- |
| Q1 | Is any field work lost? | **Zero** photos, GPS steps or handovers missing from the ledger, compared with the observer's notes |
| Q2 | Does queued work go out once signal returns? | 95 % of queued items reach the server within 10 minutes of a usable signal, without the user doing anything |
| Q3 | Is sending fast enough on a weak signal? | One extraction photo sends in under 60 s on 3G with one or two bars |
| Q4 | Is the GPS good enough as evidence? | Accuracy ≤ 20 m in 90 % of readings in the open; the location-mismatch alert (5 km) does not fire falsely |
| Q5 | Are the photos good enough as evidence? | A PMD reviewer can read documents and judge extraction photos taken in sun, dust and low light |
| Q6 | Does the session last a day without signal? | Nobody has to sign in again in the field during the trial |
| Q7 | Can users do it alone? | After one demonstration, 80 % of tasks are completed without help; no task needs more than one question |
| Q8 | Does it run on the phones people own? | No crashes; the app opens in under 5 s on the slowest phone; a full working day uses under 20 % battery |

## People, places and phones

- **Users:** 3–4 miners, 2 transporters, 1 collector (plant), using their own accounts on staging.
  Each signs a short consent for the trial (what is recorded, that it is test data, who sees it,
  when it is deleted) under Ley 29733.
- **Observers:** one PMD person per site, writing down what each user does and when (the observer
  sheet below). Observers do not touch the phones.
- **Places:** a mine with no mobile data at the workings, the road to the collector (signal comes
  and goes), and the collector's plant (Wi-Fi or good signal).
- **Phones:** the users' own phones where possible. Make sure the group includes:
  - an entry-level Android with 2–3 GB of RAM and Android 11–13 (the most common kind in mining areas);
  - a mid-range Samsung, Motorola or Xiaomi;
  - an iPhone, if any user has one.

  Note each phone's model and free storage on the observer sheet; the field report records them too.

## Before going

1. **Staging ready:** backend on staging with Cognito, S3 and SNS (see
   [deployment-aws.md](deployment-aws.md)); test accounts approved in the back office; a test plant
   registered with a relationship to each miner.
2. **Build:** install the `preview` profile (`npx eas-cli@latest build --profile preview --platform
   android`). It is an APK installed from a link, pointing at staging (`eas.json`). Install it on
   every phone at the office, sign in once with signal, and allow camera, location and
   notifications.
3. **Bench test (half a day, at the office):** run every scenario below on an Android emulator with
   a slow network (`emulator -avd <name> -netspeed edge -netdelay gprs`) and by switching airplane mode
   on and off on two real phones. Fix anything that fails before travelling.
4. **Clear the logs:** on each phone, send a field report once (Profile → Field report) so it works,
   and so the trial's reports start from a known point.
5. **Kit:** printed observer sheets, power banks, a phone with a known-good signal for the
   observer, a GPS reference (a phone or handheld GPS with a clear view of the sky) for Q4.

## Scenarios

Run each one on at least two different phones. "Offline" means airplane mode, or a place with no
data at all.

| ID | Where | Steps | Check |
| --- | --- | --- | --- |
| S1 | Office | Sign in with the SMS code; open every tab | Works; the app opens again offline with the last data shown |
| S2 | Mine, offline | Create a lot, add 3 extraction photos, complete it | The app says each action is saved and will be sent; Profile → Pending uploads lists them |
| S3 | Mine → road | Walk or drive until there is a signal; do nothing in the app | Q2: items leave on their own (note the time signal returned and when Pending uploads emptied) |
| S4 | Weak signal (1–2 bars) | Add a photo; time it | Q3 |
| S5 | Road, signal coming and going | Transporter: pick up the lot, record GPS steps every ~10 minutes, deliver | Every step is in the ledger, in order, with the device time it was taken, not the time it was sent |
| S6 | Anywhere, with items queued | Close the app from the task list; restart the phone; open it again | Nothing is lost; items are still listed and are sent (Q1) |
| S7 | Offline all day | Keep using the app for more than an hour after the last signal | Q6: no sign-in needed; work done late in the day is sent that evening |
| S8 | Mine | Photograph an ID card and extraction in bright sun, in shade and at dusk | Q5, judged later by a PMD reviewer on the web |
| S9 | Mine pit, open sky, near walls or a tunnel mouth | Record GPS readings at marked spots and note the reference GPS | Q4: compare with the reference; note the accuracy the app shows and how long it took |
| S10 | Plant | Collector: confirm the delivery, record the lab check, propose payment; miner accepts on the phone; PMD validates; collector marks paid | The whole flow ends with a passport the public page shows |
| S11 | Any phone nearly full (< 500 MB free) | Queue 5 photos offline | The app keeps working or says clearly why it cannot |
| S12 | All day | Note battery at start and end of the day | Q8 |
| S13 | All | Watch users do S2, S5 and S10 after one demonstration | Q7: note every question and every wrong tap |

## What to collect

- **Field reports:** at the end of each day, and whenever something goes wrong, each user opens
  Profile → **Send field report** and sends it to the trial's WhatsApp group or email. The report
  says:
  - the phone model, Android version, memory and free storage;
  - how many items are still waiting;
  - every send attempt: its result, how long it took and how fast uploads went;
  - the signal changes (offline, 2G/3G/4G);
  - each GPS reading's accuracy and time to fix.

  It holds no names, phone numbers, locations or photos. The `summary` block has the numbers for Q2,
  Q3 and Q4; the `events` list has the detail.
- **Observer sheet** (one row per action):

  | Time | User | Phone | Place | Signal (none / weak / good) | Action | What the app showed | Problem or question |
  | --- | --- | --- | --- | --- | --- | --- | --- |

- **Server side:** after each day, compare the ledger (back office → lot → custody ledger) with the
  observer sheets, for Q1. Note any 4xx or 5xx errors in the backend logs for those users.
- **Photos of problems:** a photo of the phone's screen (taken with another phone) is worth more
  than a description.

## After the trial

1. Put each problem in one list, with a severity:
   - **blocker:** work lost, or the user cannot continue;
   - **major:** works, but needs help or a workaround;
   - **minor:** confusing or slow, but completed.
2. Answer Q1–Q8 with the numbers, and decide go or no-go for the pilot. Every blocker is fixed
   and re-tested on the bench before the pilot.
3. Delete the trial's personal data from staging as promised in the consent, and the field reports
   from the WhatsApp group and inboxes.
4. Update the open product questions in [handover.md](handover.md) with what the trial showed (for
   example, the photo resolution, the minimum photos per lot, the location-mismatch threshold).
