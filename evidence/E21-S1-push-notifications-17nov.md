# E21-S1 — Push notifications (FCM), build 1.0.22+23

Date: 17 Nov 2026
Branch: `feat/push-notifications` (off `release/mobile-1.0.21` @ 4e4d3f8)
Owner-supplied credentials: `google-services.json` for project `okuvu-236a6`,
app `ai.okuvu.app` (received 17 Nov).

## What this build adds

The delivery half of the Updates inbox, on both sides:

| Half | File | What it does |
| --- | --- | --- |
| Handset | `apps/mobile/lib/src/core/push_service.dart` | Asks the notification permission after sign-in, registers the FCM token, refreshes it, forgets it on sign-out, routes a tap |
| Handset | `android/app/src/main/kotlin/.../MainActivity.kt` | Creates the `okuvu_care_team` channel at HIGH importance |
| Handset | `AndroidManifest.xml` | `POST_NOTIFICATIONS` + default-channel meta-data |
| Handset | `features/notifications/push_lifecycle.dart` | Ties the service to session state and to the router |
| API | `src/lib/push.ts` | FCM HTTP v1 sender, JWT assertion via `node:crypto`, dead-token pruning, preference gate |
| API | `src/routes/devices.ts` | `POST /devices`, `DELETE /devices` |
| API | `src/routes/internal-push.ts` | The portal's hop: `/internal/push/notify` and `/internal/push/broadcast` |
| API | `src/lib/broadcast.ts` | Admin → everyone, own switch, one-per-client-per-IST-day cap |
| Portal | `src/server/push.ts` | Thin client of the internal hop; non-throwing, 5 s bounded |
| Portal | `src/server/notifications.ts` | Push fires beside the committed row, before the email branch |
| Types | `packages/shared-types/index.ts` | `buildPushCopy` — the only place lock-screen wording is chosen |
| DB | `packages/prisma/migrations/20261117120000_push_devices` | `DeviceToken`, two preference columns, `last_broadcast_at` |

## Four decisions worth recording

1. **The portal does not own the FCM credential.** It posts a *kind* to the api,
   which builds the copy and signs the send. Two consequences: only one
   deployable holds the service account, and clinical prose cannot travel over
   the hop even if a caller tried (pinned by a test that sends
   `title: 'Journal about the abuse'` and asserts it is ignored).
2. **The sender is a bare `fetch`, not `firebase-admin`.** One signed assertion,
   one token exchange, one POST — the same reasoning as the Brevo sender. The SDK
   adds a credential-discovery chain that fails looking like a network error.
3. **Unconfigured is inert, not broken.** With no `FCM_SERVICE_ACCOUNT_JSON` the
   api logs once and returns `{configured:false}`; the portal no-ops without
   `PUSH_INTERNAL_URL`/`SECRET`. The product keeps working, minus the buzz.
4. **Two switches, two policies.** `push_notifications_enabled` (therapist sends)
   and `broadcast_push_enabled` (admin announcements) are separate on purpose: a
   talkative broadcast that can mute a therapist's reminder teaches clients to
   turn notifications off.

## Verification actually run

- `apps/api`: `tsc --noEmit` clean. New suites `push-sender.test.ts` (13) and
  `push-routes.test.ts` (13) pass. Full api suite: see below.
- `apps/therapist-portal`: `tsc --noEmit` clean. New suite
  `notifications-push.test.ts` (5) passes; full portal suite 425 passed.
- `apps/mobile`: `flutter analyze` — no issues. `push_service_test.dart` (6) passes.
- Android release bundle built with the `com.google.gms.google-services` plugin
  and the real `google-services.json` (see the build log line in this directory's
  session record); a green build is the only proof that the plugin resolved the
  config.

## What is NOT proven yet, and what is needed

- **No push has been delivered to a handset.** The send path is built and
  unit-tested; delivery needs the second credential.
- **Blocking owner action:** the FCM service-account private key (Firebase
  console → Project settings → Service accounts → Generate new private key). It
  goes into Secrets Manager as `evia-beta/fcm-service-account` and is injected as
  `FCM_SERVICE_ACCOUNT_JSON` (raw JSON or base64 — both parse).
- **Migration not applied to production** — `20261117120000_push_devices` must run
  before the new api image serves traffic.
- **Env wiring on the live task definitions** (this repo's terraform does not own
  the portal or the current api task definitions, so the wiring is done on the
  deployed definitions):
  - api: `PUSH_INTERNAL_SECRET` (new secret), `FCM_SERVICE_ACCOUNT_JSON`
  - portal: `PUSH_INTERNAL_URL` (api Cloud Map / internal ALB), `PUSH_INTERNAL_SECRET`
- **Timed reminder sweep** (e.g. "24 h before a session") still does not exist.
  Event-driven sends (assignment, reminder set, booking, reschedule, cancel) all
  fire now; a timed one needs a scheduled rule plus a sweep route.
- **Admin broadcast has no portal UI yet.** The procedure and the api route are
  built and tested; the button is the next piece.
- **No client-facing switch in Settings** for push/broadcast. Defaults are `true`
  and the OS permission governs; the toggle row is a follow-up.
- iPhone cannot buzz until an Apple Developer account and an APNs key exist.

## Sequencing note

This ships beside the minimum-version gate (E20-S1, 1.0.21+22) deliberately: a
push feature is only as good as the build on the phone, and the gate is what makes
the fleet reachable by a server-side floor rather than by hope.
