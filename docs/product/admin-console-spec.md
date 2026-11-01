# Admin Console — Product Specification

Status: draft for review · Owner: Product (PM) · Written 31 Oct 2026
Scope: a business-facing console for Okuvu's pilot operation, built inside the existing
therapist portal (`apps/therapist-portal`), on `develop` @ `c3caa7a`.
Companion document: [`admin-console-data-model.md`](./admin-console-data-model.md) — exact
Prisma models, queries, migration and backfill plan, per-phase engineering breakdown.

---

## 0. The short version

- The console serves **two people**, not a department: an operations lead (Rajwant or a
  delegate) and the clinical supervisor (Shubhangi or a delegate). Everything below is sized
  for that, and for a pilot of ~20 users / 2–3 therapists.
- **No payment infrastructure exists in this repo.** No payment, payout, invoice,
  subscription, transaction, ledger or refund model; no gateway integration. Both payin and
  payout are greenfield. §6 is therefore the biggest build in this document and is
  deliberately sequenced *last*, because the pilot can run without money and cannot run
  without a roster.
- The existing `/admin` is a **therapist-side admin** (add therapist, invite client, assign
  client). It is not a business console. We **extend** it rather than replace it; the two
  screens it has today move to `/admin/roster` and `/admin/therapists` unchanged in
  behaviour. §3.4.
- Access today is a single env allowlist (`ADMIN_EMAILS`) matched against a NextAuth session,
  and sign-in only succeeds for emails that already have a `Therapist` row. There is no role
  field. A non-clinical operations hire literally cannot log in without becoming a
  "therapist". Fixing that is Phase 0 and it is a one-column change.
- **A business admin must not be able to read a client's conversation.** Clinical detail is
  the supervisor's, and raw conversation is break-glass only: reason field, time-boxed,
  written to a new queryable log *and* to the tamper-evident `AuditEvent` chain. §2.4.
- Money is a set of questions for a chartered accountant before it is a set of tables. §6.8
  names them and asserts none of the answers.

---

## 1. Who the admins are, and what they need to know

### 1.1 Reality check

The supervised-beta roster (`docs/supervised-beta/03-participant-roster.md`) is a markdown
table that one coordinator fills in by hand after every session: therapist email, client
name, client phone, consent tick, sessions planned, sessions done, whether T-03 and T-05 were
used. That file *is* today's admin console, and it is the honest benchmark for Phase 1: the
console has won when that table can be deleted.

So:

| Fact | Value | Consequence |
|---|---|---|
| People with business-admin access | 1, plus 1 backup | No RBAC ceremony, no approval workflows, no org hierarchy |
| People with clinical-supervisor access | 1 (Shubhangi) | Clinical views are single-holder; break-glass reviewer is named, not a group |
| Therapists in pilot | 2–3 | Per-therapist views are a list, not a paginated table |
| Clients in pilot | ~20 (2–3 per therapist) | Absolute counts, not percentages; no chart needs an axis |
| Sessions targeted | ≥15 supervised sessions | "On track" is a count against 15, not a rate |
| Admin working rhythm | Daily 10-minute check, weekly 30-minute review | One Today page + one weekly export |

Two admins means **no four-eyes workflow is real**. Any design that needs a second approver
to function will be bypassed. Where separation of duty matters (§2.4 break-glass, §6.5
payouts), the design must work with one person *and* leave evidence for the second.

### 1.2 The five questions, ranked by how often they are actually asked

Ranked by frequency of real need in a pilot week, not by how interesting the answer is.

**Q1 — "Who is falling through the gap right now?"** (asked daily, several times)
Unredeemed invites older than 48h, activated users with no session in 7 days, users with no
active therapist assignment, appointments in the past with no follow-up. All answerable from
`InviteToken`, `TherapistClient`, `SessionLog`, `Appointment` today.
→ Answers on `/admin` (Today), drill-through to `/admin/roster?filter=gap`.

**Q2 — "Is each therapist's load sane, and are they actually working?"** (daily)
Active clients per therapist, sessions delivered in the last 7 days, pending invites owned,
last clinical sign-in. Today the only number the portal has is `_count.client_assignments`
(`admin.listTherapists`), which counts *ended* assignments too and says nothing about
activity.
→ `/admin/therapists`.

**Q3 — "Is anyone in crisis, and has it been picked up?"** (daily; the one that cannot wait)
`SafetyState.safety_state_current` at S3/S4, `SessionLog.crisis_flag_detected` in the last
24h, and whether a therapist has opened that client's record since (`ClinicalAccessLog`).
This is the highest-stakes number on the console and the only one that justifies a red banner
on every page.
→ `/admin` top strip + `/admin/clinical` (supervisor only).

**Q4 — "Is the pilot going to hit its targets?"** (weekly)
Activated users of 20, sessions delivered against 15, outcome data collected, feedback forms
returned, care-plan changes confirmed. This is the number that decides whether the pilot is
extendable, and it is the one the roster spreadsheet exists to track.
→ `/admin` "Pilot targets" block, CSV export.

**Q5 — "What is this costing us, and (later) are we collecting and paying correctly?"**
(weekly now, daily once money is live)
Pre-money this is LLM spend against `TestBudget.monthly_cap_inr` and failed operational jobs.
Post-money it is captured vs refunded vs owed to therapists vs paid. Deliberately ranked
fifth: in a free pilot it is a cost question, and cost does not need a console page until the
first invoice exists.
→ `/admin/money` (Phase 3+, absent before then).

**Explicitly not a question:** "how is this therapist's clinical judgement?" That is
supervision, it belongs to Shubhangi, and it does not belong on a dashboard read by
operations. See §5.5.

### 1.3 Who is not an admin

- A therapist is never a business admin. Their surface stays `/dashboard` and
  `/clients/[id]`, scoped to their own assignments by `assertClientAssigned`.
- An engineer with database access is not an admin *in the product*. Break-glass exists
  precisely so DB access is never the audit-free path.
- Nobody gets an admin account "for convenience". Two accounts exist, both named in §1.1.

---

## 2. Roles and permissions

### 2.1 The access model that exists today, and why it blocks everything

Read `apps/therapist-portal/src/server/routers/admin.ts`:

- `adminProcedure` = `protectedProcedure` + `isAdminEmail(ctx.user.email)`, where the set
  comes from `process.env.ADMIN_EMAILS`. Promoting or demoting an admin is a deploy.
- `apps/therapist-portal/src/lib/auth.ts` `signIn` refuses any Cognito identity without a
  `Therapist` row. So every admin is a `Therapist` row by construction.
- `Therapist` has no `role`, no `is_active`, no capacity. One row = full clinical privilege
  over every client assigned to it (`docs/audit/evia-therapist-portal-audit.md` §8).

The consequence is precise and worth stating plainly: **today, hiring an operations person
means creating a therapist record for them.** That is the defect Phase 0 fixes. It is one
nullable-then-backfilled enum column plus a middleware change, not a re-architecture.

### 2.2 Three roles

| Role | Who | Job |
|---|---|---|
| `THERAPIST` | 2–3 pilot clinicians | Their own caseload only. Unchanged surface. |
| `CLINICAL_SUPERVISOR` | Shubhangi or a named delegate | Clinical oversight of all clients: safety, care plans, outcome data, break-glass review. All clinical reads logged. |
| `BUSINESS_ADMIN` | Rajwant or a delegate | Coverage, load, delivery, money. **No clinical content, no raw conversation.** |

Rules:

1. One role per person. If Shubhangi needs the money screen, that is a second decision, not a
   default — the point of the matrix is that no single account holds both clinical and
   financial authority.
2. `BUSINESS_ADMIN` never implies `CLINICAL_SUPERVISOR`. This is the whole design.
3. `THERAPIST` is the default for every existing row; backfill is `UPDATE ... SET role =
   'THERAPIST'`.
4. Role changes are themselves audited (`AuditEvent`, action `admin.role_changed`).
5. `ADMIN_EMAILS` survives only as a **bootstrap** allowlist during migration, with a
   documented removal date. It must not remain the primary mechanism, because it cannot
   express *which* role.

### 2.3 Permission matrix

Legend: **Y** allowed · **L** allowed but logged to `ClinicalAccessLog` (action
`SUPERVISOR_VIEW_*`, written against the supervisor's own `Therapist` row — every supervisor
is a `Therapist` row by construction, see §2.1) · **B** break-glass only (reason + time-box +
`AdminAccessLog` + `AuditEvent`, §2.4) · **—** denied.

| Capability | Business admin | Clinical supervisor | Therapist |
|---|---|---|---|
| Today dashboard (operational tiles) | Y | Y | — |
| Safety strip: counts of S3/S4 and crisis flags in 24h | Y (counts only) | Y | own clients only (existing) |
| Which users are in S3/S4 (names) | — | L | own clients only |
| Roster: assignment state, last active, session counts | Y | Y | own clients only |
| Roster: care plan / presenting issues per user | — (aggregate mix only) | L | own clients only |
| Mood values / trend per user | — | L | own + `chat_access_granted` |
| Session summaries per user | — | L | own + `chat_access_granted` |
| Therapist notes | — | L | own, authored |
| Outcome measure scores per user | — | L | own + granted |
| Raw conversation (`Turn.content`), journal entries, `UserMemory` | B | B | own + `chat_access_granted` |
| Emergency contact (decrypted) | — | B, crisis only | own + `chat_access_granted` |
| Add therapist / deactivate therapist | Y | — | — |
| Create client + invite; assign; reassign; end assignment | Y | — | create/assign no; end own yes (existing `clients.end`) |
| Resend invite | Y | — | — |
| Set therapist capacity | Y | — | — |
| Change a client's care plan | — | — | Y (existing `clients.setCarePlan`) |
| Edit safety thresholds, prompts, crisis resources, model pins | — | — | — |
| View payments, packs, refunds | Y | — | own earnings only |
| Issue refund | Y (≤ remaining pack value, reason required) | — | — |
| Approve / record payout | Y | — | own statement only |
| Break-glass request | B | B | n/a (uses consent path) |
| Review break-glass log | Y (read all rows) | Y (read all rows, owns 24h review) | — |

Three deliberate asymmetries, each a decision:

- **The business admin sees safety *counts* but not safety *names*.** They must know whether
  the pilot is safe; they must not know who is in crisis. A count of 1 with no name still
  forces the right action (call the supervisor), which is the only action available to them.
- **The business admin cannot see care plan per user.** Care plan is a clinical
  classification (CP1 anxiety / CP2 depression / CP3 stress — `docs/design/EVIA_Mobile_Design.md`),
  not a product tier, and must never be repurposed as one. Aggregate mix is fine.
- **The clinical supervisor can read summaries without break-glass, but every read is
  logged.** Supervision is a legitimate purpose; an unlogged read is not.

### 2.4 Break-glass: the only path to a conversation

This is the sensitive escalation the brief asks to be designed deliberately. Today
`ClinicalAccessLog` records `(therapist_id, client_user_id, action, created_at)` — a free-text
action string, no reason, no requester role, and `therapist_id` is non-null. It cannot express
"an admin opened a transcript, and why". So:

**Trigger (must pick one, from a closed list):** `crisis_followup` · `complaint_investigation`
· `legal_request` · `clinical_audit` · `engineering_incident`. Free text alone is not a
trigger.

**Requirements, all enforced server-side:**

1. `reason` free text, minimum 30 characters, stored verbatim.
2. `trigger` from the enum above; `ticket_ref` optional but required when trigger is
   `legal_request` or `complaint_investigation`.
3. **Scope is explicit and minimal**: a single client, one of `transcript_window` (default:
   last 7 days, max 30), `summaries`, `journal`, `memory`. No "all data for this user" button.
4. **Time-boxed grant**: 60 minutes, server-enforced, no renewal without a new reason.
   Re-requesting the same client within 24h shows the previous reason first.
5. **Consent state is displayed before entry** — `TherapistClient.chat_access_granted` and
   whether the client has ever been told. If not granted, entering requires
   `CLINICAL_SUPERVISOR` role and the banner says so.
6. **Written twice**: a queryable `AdminAccessLog` row (who, what, why, when, expiry) and an
   append-only `AuditEvent` (`actor`, `action=admin.break_glass.opened`, `object=client:<id>`,
   canonical body including the reason hash). The hash chain is what makes it tamper-evident;
   the table is what makes it answerable in a query.
7. **Review within 24h** by the *other* role holder. With two people this is one person
   reviewing the other's access; if the only supervisor is the requester, the review is
   recorded as `self_reviewed: true` and surfaced on the Today page until acknowledged. The
   design must not pretend a two-person rule exists when it doesn't.
8. **No bulk export, no screenshots endpoint, no "download transcript".** Copy is the browser's
   problem; the product does not provide a file.
9. **Business admin break-glass is capped**: max 2 grants per week; the third requires the
   supervisor to open it on their behalf. This keeps the routine path routine.

**Where the line sits:** break-glass is an incident path, not a research or convenience path.
If an admin finds themselves using it weekly, the console is missing an operational view and
that is the bug to fix.

### 2.5 DPDP Act 2023 — what this console must satisfy

Not legal advice; these are engineering constraints derived from the Act's obligations, to be
confirmed by counsel.

| Obligation | How the console satisfies it |
|---|---|
| Purpose limitation (s.8) | Three roles with three purposes. Business admin sees operations, supervisor sees clinical care, therapist sees their caseload. No screen mixes them. |
| Data minimisation | Business admin gets counts/recency/state, never content or scores. Emergency contact is never rendered outside a crisis flow. |
| Consent (s.6) | Chat access is per-therapist (`TherapistClient.chat_access_granted`) but is an **admin/therapist attestation — there is no client-facing consent UI**. This is a known gap: break-glass is the only admin path to content precisely because the client has not consented to admin access. Phase 2 should add a client-visible consent record; until then, break-glass is the honest control. |
| Security / access logging (s.8(4)-adjacent) | Every clinical read by a supervisor is written to `ClinicalAccessLog` as `SUPERVISOR_VIEW_*`; every break-glass is double-logged (new `AdminAccessLog` + hash-chained `AuditEvent`); role changes are audited. |
| Erasure on withdrawal (s.8) | Not in scope here, but note: `AdminAccessLog` and `AuditEvent` rows must survive erasure of the client (they are the accountability record). Design them to store a client reference that can be tombstoned, not a copy of content. |
| Children (s.9) | If any pilot user is under 18, parental consent applies and this console needs an age-gate answer first. **Open question for legal — not decided in this document.** |
| Breach notification | Break-glass log is the evidence pack for "who could have been affected". Keep 12 months minimum; confirm retention with counsel. |

### 2.6 The clinical boundary (Shubhangi's line)

Anything that changes how the product *behaves clinically* is out of bounds for this console,
for every role, permanently:

- A1 safety classification thresholds and S0–S4 definitions
- A9-pre/A9-post governance gates, prompt versions, `PromptRegistryEntry`
- Crisis resources (`CrisisResource`), crisis copy, escalation routing
- Care plan definitions (CP1/CP2/CP3) and what each plan's prompt does
- Model choice and pins (`ModelConfigPin` and its surrounding config)
- Taper/closure behaviour (`Turn.taper_state`, `closure_offered`)
- Any write to `SessionLog`, `Turn`, `SessionSummary`, `SafetyState`, `GovernanceLog`

Operating rule: **the admin console has no write path to any of those tables, and adding one
requires a spec signed by Shubhangi, not a ticket.** The single clinical write anywhere in the
portal remains `clients.setCarePlan`, which is therapist-scoped and already exists. The console
may *display* threshold values read-only, next to the note "clinically owned — change requires
clinical sign-off", so an admin can see the product is configured without being able to touch
it.

The console also must not let an admin "fix" a crisis by editing state. If a client is at S4
and the record looks stale, the action is to call the therapist, not to update the row.

---

## 3. Information architecture

### 3.1 Routing decision: extend `/admin`, do not build `/ops`

**Decision D3.1:** the business console lives under the existing `/admin` path in the same
Next.js app. Reasons: one auth system (Cognito + NextAuth) already gates it; one deploy; the
existing invite/assignment procedures are already there; and a second app would double the
surface that has to be secured for a two-person team.

**Decision D3.2:** `/admin` becomes the Today dashboard. The existing two-tab `AdminContent`
moves, with no behaviour change, to `/admin/roster` (its "Clients" tab) and
`/admin/therapists` (its "Therapists" tab). Tab state disappears; each is a real route.

**Decision D3.3:** the role gate moves from email-in-env to `Therapist.role ∈ {BUSINESS_ADMIN,
CLINICAL_SUPERVISOR}`, checked in a new `adminProcedure` that also loads the actor. The
`amIAdmin` query stays (the client sidebar uses it) and returns `{ isAdmin, role }`.

**Decision D3.4:** every admin route is server-rendered with the role check *before* data
fetch, not only in the client component. Today `admin/page.tsx` only checks for a session and
lets `AdminContent` decide; that is acceptable for a read-only denial screen but not for
clinical routes.

### 3.2 Sitemap

```
/admin                          Today — the 6-block dashboard (§7)
/admin/roster                   Users: assignment, activation, recency, delivery  (was: Clients tab)
/admin/roster/[userId]          Operational detail — no clinical content
/admin/therapists               Load, activity, capacity, invite ownership  (was: Therapists tab)
/admin/therapists/[id]          One therapist: caseload, 7-day delivery, earnings summary link
/admin/clinical                 Supervisor only — caseload clinical overview
/admin/clinical/[userId]        Safety, care plan, summaries, outcome scores, break-glass button
/admin/access-log               Break-glass and clinical-access log (all roles, read-only)
/admin/money                    Phase 3+. Overview: collected, refunded, payable, unreconciled
/admin/money/payments           Payment attempts, failures, refunds
/admin/money/packs              Pack balances, expiry, consumption
/admin/money/payouts            Per-therapist earnings, payout runs, statements
/admin/money/reconciliation     Daily recon output and mismatches
/admin/settings                 Phase 3+: roles, capacity, catalog, thresholds (read-only)
```

Nav is five items max, filtered by role: **Today · Roster · Therapists · Clinical\* · Money\***
(\* conditional). Invites live inside Roster because an unredeemed invite is a roster state,
not a separate object; a top-level nav item for it would be a place nobody visits.

### 3.3 Page by page

**`/admin` — Today.** The only page an admin opens on a normal day.
*Shows:* the six blocks in §7, in that order.
*Does:* nothing but navigate. No mutations. A dashboard that can write is a dashboard people
are afraid to click.
*Decision:* if a number is red, the tile links to the filtered list that fixes it. No tile
links to a chart.

**`/admin/roster`.** The replacement for the spreadsheet.
*Shows:* one row per user — name, therapist (or "unassigned"), assignment state
(pending/active/ended, derived from `activated_at`/`ended_at` as `clients.ts` already does),
activated date, last chat session, sessions in last 7/28 days, next appointment, pack balance
(Phase 3). Filters: `gap` (Q1), `pending_invite`, `unassigned`, `inactive_7d`, `ended`.
*Does:* create client + invite (existing `createClientWithInvite`), assign existing user
(existing `assignClient`), **reassign** (new), end assignment (new), resend invite (existing).
*Decision:* the default view is `gap`, not "all". The admin's job is exceptions.

**`/admin/roster/[userId]`.** Operational only: assignment history, invite history
(`InviteToken` created/redeemed/expired), appointment list with attendance, pack balance,
audit trail of admin actions on this user. **No mood, no care plan, no summary, no transcript**
— those are behind `/admin/clinical/[userId]`, which the business admin cannot open.
*Decision:* this is the page that proves the boundary; if it starts showing clinical fields in
review, the design has failed.

**`/admin/therapists`.** Table: name/email, active clients (not total — see §4.2), capacity,
sessions delivered last 7d, pending invites, last clinical activity, `is_active`.
*Does:* add therapist (existing), deactivate, set capacity.
*Decision:* "active clients" is defined as assignments with `ended_at IS NULL AND activated_at
IS NOT NULL`; the current `_count.client_assignments` includes ended and unactivated rows and
must not be reused as-is.

**`/admin/clinical`.** Supervisor only. One row per client: current safety state, care plan,
days since last session, last SRS, last outcome score, flags (crisis in 24h, no therapist
contact in 14d).
*Decision:* sorted by risk, not by name. Default filter `needs_attention`.

**`/admin/clinical/[userId]`.** Safety state, care plan + history, last 3 summaries, mood
trend, SRS trend, outcome scores, homework state. A single **"Open conversation…"** button
that starts break-glass (§2.4).
*Decision:* summary text is visible here without break-glass, because supervision without it
is not supervision; but every render writes a `ClinicalAccessLog` row (`SUPERVISOR_VIEW_CLIENT`
or finer-grained `SUPERVISOR_VIEW_SUMMARIES`), reusing the existing table rather than inventing
a second audit path.

**`/admin/access-log`.** Every `AdminAccessLog` row: who, role, client, trigger, reason,
scope, opened_at, expires_at, reviewed_at/by. Filters by role and unreviewed.
*Decision:* readable by both admin roles. Transparency about who looked at whom is itself a
control; hiding the log from the business admin would make the supervisor unaccountable.

**`/admin/money/*`.** §6.7.

### 3.4 Migration path for today's `AdminContent`

`AdminContent.tsx` is 422 lines: two tabs, four mutations, an inline "add therapist" form, an
inline "assign client" form, the pending-invite table with resend, and the `AddClientWizard`
modal. It is not broken; it is misplaced.

| Step | Change | Risk |
|---|---|---|
| 1 | Extract the Clients tab body → `roster/ClientRoster.tsx`; Therapists tab body → `therapists/TherapistTable.tsx`. Pure move, same tRPC hooks. | Low — no behaviour change, same procedures |
| 2 | New routes `/admin/roster`, `/admin/therapists` render those components inside `AuthenticatedShell`. | Low |
| 3 | `/admin` becomes the Today page; `AdminContent.tsx` deleted in the same PR that lands Today. | Low — no deep links in the wild; `/admin` still exists |
| 4 | Replace `isAdminEmail` with `requireAdminRole()`; keep `ADMIN_EMAILS` as an OR-branch for one release so nobody is locked out mid-deploy. | Medium — must be a single PR with tests for all three roles |
| 5 | `AddClientWizard` moves under Roster, unchanged. Its consent attestation checkbox stays; §2.5 notes the gap it papers over. | Low |

No data migration is required for steps 1–5. The only schema change is `Therapist.role`
(plus `is_active`, `capacity`), which is additive with a default.

---

## 4. Therapist ↔ user mapping

### 4.1 What the schema actually gives us

`TherapistClient` is `(id, therapist_id, client_user_id, created_at, chat_access_granted,
chat_access_requested_at, activated_at, ended_at)` with `@@unique([therapist_id,
client_user_id])` and an index on `client_user_id` only.

Consequences, stated because they shape every screen:

1. **A user can have two active therapists.** Uniqueness is per pair, not per client. Nothing
   prevents `assignClient` being called for a second therapist; today it would simply succeed.
2. **There is no reassignment procedure.** The only way to move a client is the therapist
   calling `clients.end` and then an admin assigning again — which operations cannot do
   themselves, and which leaves a window where the client has no therapist.
3. **Consent does not travel.** `chat_access_granted` is per assignment. Reassignment must
   reset it to `false`; carrying it over would silently extend a consent the client gave to a
   different clinician.
4. **Capacity and availability do not exist.** No `capacity`, no `is_active`, no
   specialisation, no language field on `Therapist`. (Client language is
   `User.language_mode`, and the assignment flow can set it.)
5. **Status is derived, not stored** (`activated_at`/`ended_at` → pending/active/ended, per
   `clients.ts` `deriveStatus`). Keep that; do not add a status column that can drift.

### 4.2 What the admin needs, and the query behind it

| Need | Definition (against the real schema) | Status |
|---|---|---|
| Load per therapist | count of `TherapistClient` where `therapist_id = t` and `ended_at IS NULL` and `activated_at IS NOT NULL` | Computable now |
| Pending load | same but `activated_at IS NULL` | Computable now |
| Unassigned users | `User` with no `TherapistClient` row where `ended_at IS NULL` | Computable now (anti-join; no index for it — fine at 20 users, needs an index at 5k) |
| Double-assigned users | `User` with ≥2 assignments where `ended_at IS NULL` — **a data-quality alarm, not a feature** | Computable now; should be impossible after §4.3 |
| Reassignment | end old + create new, in one transaction, consent reset | **Needs new procedure** |
| Capacity | `Therapist.capacity` (int, nullable) vs active load | **Needs new schema (one column)** |
| Inactive therapist | no `ClinicalAccessLog` and no `Appointment` in 14 days | Computable now (`ClinicalAccessLog` has `(therapist_id, created_at)` index) |
| Therapist's own activity | last `ClinicalAccessLog.created_at`, sessions delivered = `Appointment` where `scheduled_at < now` and `cancelled_at IS NULL` | Computable now; attendance is inferred, see §5 |

### 4.3 Rules the console must enforce

**R1 — one active therapist per user.** Enforce with a partial unique index:
`CREATE UNIQUE INDEX ... ON therapist_clients (client_user_id) WHERE ended_at IS NULL;`
This is the single most valuable integrity change in §4, and it must land before reassignment
ships. (Prisma cannot express partial indexes; it goes in a raw-SQL migration and is
documented in `docs/prisma-migration-drift.md`'s style.)

**R2 — reassignment is a transaction, not two clicks.** `reassignClient(userId, fromTherapistId,
toTherapistId, reason)`:
1. set `ended_at = now()` on the old row,
2. create the new row with `chat_access_granted = false`,
3. set `chat_access_requested_at = null`,
4. write `AuditEvent` (`admin.client_reassigned`, body includes reason),
5. email the new therapist via Brevo (existing `sendInviteEmail` transport), because there is
   no push/notification infra anywhere in the product.

No email to the client in v1 — the client experience of "your therapist changed" needs copy
from Shubhangi, not from engineering.

**R3 — ending an assignment is soft.** Never delete `TherapistClient`; `ended_at` only. History
is the clinical record.

**R4 — capacity is a warning, not a block.** With 2–3 therapists, a hard block will strand a
client at 9pm. Show "over capacity (12/10)" in amber and let the admin proceed; log the
override. Hard limits are for later, when there is someone to escalate to.

**R5 — unassigned users are a red state only after 24h.** A user who just signed up is not a
failure; a user who has been unassigned for a day is.

---

## 5. Therapy progress — "is this user actually getting better?"

### 5.1 The honest framing

Okuvu's schema can measure **engagement, self-reported mood, session-level satisfaction,
homework state, safety events and clinician contact**. It cannot, today, measure **clinical
improvement**, because there is no validated outcome instrument anywhere in the 38 models. Any
dashboard that claims otherwise is selling a feeling.

So the console separates three things that are usually conflated:

- **Delivery** — did the care happen? (sessions, contact, invites, activation)
- **Engagement** — is the user showing up? (chat activity, streaks, mood logging adherence)
- **Change** — is the user better? (mood trend = weak signal; validated outcome measure =
  the only defensible one, and it does not exist yet)

Business admin sees Delivery and aggregate Engagement. Supervisor sees Change signals per
client. Nobody sees a single "progress score", because a composite number invites decisions
that the underlying data cannot support.

### 5.2 Metrics, each mapped to its source

Legend: **NOW** computable from existing tables · **VIEW** needs a read model/index/materialised
query but no new fields · **SCHEMA** needs new columns/tables.

| # | Metric | Question it answers | Source (model.field) | Status | Caveat |
|---|---|---|---|---|---|
| 1 | Sessions delivered | Did therapy happen? | `Appointment.scheduled_at` in past, `cancelled_at IS NULL` | VIEW | No attendance field. "Scheduled and not cancelled" ≠ "happened". Needs `completed_at` (SCHEMA, 1 col) to be true. |
| 2 | Sessions scheduled next 7d | Is there a plan? | `Appointment` | NOW | — |
| 3 | Chat sessions | Is the user using the companion? | `SessionLog.session_started_at`, `turn_count` | NOW | Counts existence, not value. |
| 4 | Active days (7/28) | Is use habitual? | `SessionLog` distinct dates; `EngagementProfile.current_streak` | VIEW | Streak resets on a missed day and over-punishes; show active-days, not streak, to admins. |
| 5 | Days since last session | Is someone drifting? | `SessionLog` max(`session_started_at`) or `EngagementProfile.last_session_date` | NOW | — |
| 6 | Mood mean + direction (14/28d) | Is self-reported state moving? | `MoodLog.mood_value` (int 1–5, one row per `date_ist`) | NOW | Weak. See §5.3. |
| 7 | Mood logging adherence | Can we trust #6? | `MoodLog` count / days since assignment | NOW | Must be displayed *next to* #6; a trend from 4 of 28 days is noise. |
| 8 | SRS mean | Did the session land? | `SessionLog.session_feedback_score` (int 1–4) | NOW | Per chat session, not per therapy session; direction of the 1–4 scale is not documented in code — confirm with Shubhangi before labelling it. |
| 9 | Homework assigned / completed | Is between-session work happening? | `Homework.status` (`active`/`completed`/`archived`) | NOW | Completion is **therapist-marked** (`homework.ts` sets it after the client reports back). It is clinician attestation, not client self-report. |
| 10 | Therapist contact | Is a human involved? | `TherapistNote` count; `Appointment` count | NOW | A note is not an intervention, but zero notes for 14 days is a real signal. |
| 11 | Safety events | Is the user safe? | `SessionLog.crisis_flag_detected`, `SafetyState.safety_state_current` | NOW | The most important non-outcome metric on the page. |
| 12 | Care-plan changes | Has the clinical formulation moved? | `ClinicalConfig.care_plan_id` + `AuditEvent` | VIEW (partial) | `ClinicalConfig` overwrites in place; there is no history table. Only reconstructable from audit events, and only since the audit chain existed. Do not present a "care plan changes" chart — present current state + last change date if an audit row exists. |
| 13 | Outcome measure change (PHQ-9 / GAD-7) | **Is the user better?** | nothing | **SCHEMA** | The only defensible answer. New `OutcomeMeasure` table + client-facing administration + clinical sign-off. §5.4. |
| 14 | Dropout | Did they leave? | `User.deleted_at`, `TherapistClient.ended_at`, last activity | NOW | Withdrawal and dropout look identical; do not conflate them in copy. |
| 15 | Improvement vs a comparison | Better than what? | nothing | **SCHEMA / not in scope** | No control group, no baseline instrument, no registry. Do not promise effect sizes from this pilot. |

### 5.3 What a mood log can and cannot prove

`MoodLog.mood_value` is a 1–5 integer, one per user per IST date, source `user_input`. That is
a **single-item daily self-report with no anchors**, not an instrument.

It can: show a within-person direction over weeks; catch a sustained drop (a safety prompt);
tell you whether someone is engaging at all; give a therapist something concrete to open a
conversation with.

It cannot: establish clinical improvement; compare users (no between-person scale); compare
therapists; survive missing data (people log less when they feel worse — the missingness is
correlated with the outcome); distinguish regression to the mean from treatment effect; or
support any claim in a deck. Response shift alone (the user recalibrates what "3" means after
six weeks of therapy) can produce a flat line that hides real change, or a rising line that is
purely lexical.

Rule for the console: **mood is a prompt to ask, never a verdict.** Every render shows n and
adherence. No mood number is ever shown without "based on N of M days".

### 5.4 The one addition worth making

Recommend adding `OutcomeMeasure` (PHQ-9 for CP2/depression, GAD-7 for CP1/anxiety, scored at
intake, week 4, week 8) — client-administered in the Flutter app, 2–3 minutes, public-domain
instruments with validated Hindi versions.

Why it is worth 3–4 engineer-days: it is the difference between "the pilot felt good" and "8 of
20 users moved a validated score by ≥5 points". It also gives the supervisor something to
supervise and gives the therapist a session agenda.

**This is Shubhangi's decision, not the PM's**: which instrument, which cadence, what happens
when a score is in the severe range (does it page a therapist? does it change A1 routing?),
and whether administration is mandatory. Do not build the form until she signs the instrument
and the escalation rule. The schema can be added before that (it is inert without a form).

### 5.5 Metrics we deliberately do not show

- **Therapist ranking by client mood/SRS.** Goodhart in one step: it rewards pleasant sessions
  over useful ones. Supervision uses the clinical view, in conversation.
- **A composite "progress score".** Adds precision the inputs do not have.
- **Per-therapist revenue vs client outcomes side by side.** Invites exactly the wrong
  optimisation; also crosses the §2.6 boundary by making clinical data a performance metric.
- **Engagement leaderboards for clients.** Same reason, plus shame is a clinical risk.

---

## 6. Money

### 6.1 What exists today: nothing

To be unambiguous: there is **no payment, payout, invoice, subscription, transaction, ledger or
refund model** in `packages/prisma/schema.prisma`. The only money-shaped fields in the entire
38-model schema are `TestBudget.monthly_cap_inr` (LLM test spend) and
`session_feedback_score` (a 1–4 rating, not money). No gateway SDK is integrated. No
`RAZORPAY_*` env var, no webhook route. Payin and payout are both greenfield.

That is not a criticism — the pilot is free and supervised — but it means §6 is a build, not a
config change, and it is correctly sequenced last.

### 6.2 Recommendation: prepaid session packs, Okuvu as merchant of record

**Hypothesis (needs Rajwant's confirmation):** users pay for **therapist sessions**, not for
the AI. The companion is unmetered and included, because metering the thing that produces the
outcome would be a strange way to run a mental-health product.

**Recommended model: a prepaid pack of 4 × 50-minute therapist sessions, valid 10 weeks,
paid once by UPI; AI companion unlimited.**

| | |
|---|---|
| Pack | 4 sessions, 10-week expiry |
| Illustrative price | ₹6,000 per pack (₹1,500/session) — **illustrative only, not a recommendation of the number** |
| Therapist share | ₹1,000 per completed session, flat, all therapists — **illustrative** |
| Platform share | the remainder, out of which gateway fees and any tax |
| Refunds | unconsumed sessions only, pro-rata, minus gateway fee; consumed sessions are non-refundable |
| Expiry | unused sessions expire at 10 weeks; no auto-renew, no auto-charge |

**Why packs over the alternatives:**

- *vs subscription:* a recurring mandate needs e-mandate/UPI-Autopay setup, retry logic,
  proration and dunning — four subsystems for 20 users. It also auto-charges a depressed user
  monthly, which is a support and ethics problem, not just an engineering one.
- *vs pay-per-session:* collection risk lands exactly at the moment of need (a user in crisis
  who cannot pay this week), and every booking becomes a payment failure path. Packs move
  payment to a calm moment.
- *vs free + later:* no revenue signal before the pilot ends, and no way to test willingness
  to pay, which is the main commercial question the pilot should answer.

**Why Okuvu as merchant of record:** one checkout, one refund path, one ledger, one invoice
counterparty. The alternative (therapist bills the client, Okuvu takes commission) moves GST
and marketplace/aggregator questions onto the therapist and turns Okuvu into a payment
facilitator — which changes the compliance shape without reducing work. **This is the single
biggest CA question (§6.8 Q1) and it is a dependency for the data model, not a detail.**

### 6.3 Payout model

- Accrue **per completed Appointment**, not per pack sale. Revenue is recognised as sessions
  are consumed; therapist liability exists only for delivered work.
- Accrual is created when the appointment is marked complete (`Appointment.completed_at`), in
  the same transaction.
- **7-day hold** after completion before an earning becomes payable (covers disputes/refunds).
- **Monthly payout run**, 1st of the month for the prior month, manual bank transfer in Phase
  3 with UTR recorded, RazorpayX only when therapist count exceeds ~5 (the integration cost is
  not justified at 3).
- One payout per therapist per period; lines are the earnings rows, not a separate table.
- Payout is **idempotent and locked**: once a payout is `SENT`, its lines cannot be edited; a
  correction is a new adjustment earning, never a mutation.

### 6.4 The billing-unit decision

**Decision D6.4:** the billable unit is a **completed `Appointment`**, not a `SessionLog`.
`SessionLog` is a chat conversation with the AI; an active user may have several per day. Billing
chat sessions would punish exactly the behaviour the product exists to encourage, and would make
the ledger's unit unmeasurable to the user. `Appointment` already carries therapist, client,
time, duration, mode and cancellation — everything a ledger line needs.

This also means `Appointment` needs a completion field it does not have today. That is the
first schema change in Phase 3 and it is small (one nullable timestamp + an attendance enum).

### 6.5 Ledger requirements, by screen

| Screen | Must answer | Source |
|---|---|---|
| Money overview | Collected this month, refunded this month, net; therapist payable; failed payments 24h; unreconciled count | `Payment`, `Refund`, `TherapistEarning`, `Payout`, `LedgerEntry` |
| Payments | Every attempt with status, method, failure code, provider ref; retry; refund | `Payment` (+ `PaymentEvent` for webhook history) |
| Packs | Balance per user, expiry, sessions consumed and against which appointment | `SessionPack`, `PackRedemption` |
| Payouts | Per therapist per period: accrued, held, payable, paid, UTR, statement | `TherapistEarning`, `Payout` |
| Reconciliation | Gateway settled total = ledger cash total; payable = sum of open earnings; every captured payment has a pack; every completed appointment has exactly one earning | `LedgerEntry` + daily job |

Reconciliation is the part everyone skips and then cannot close the month. Build the job with
the screens, not after them.

### 6.6 Minimum new models

Full field-level definitions are in the companion document, §2. Summary:

| Model | Purpose | Key fields |
|---|---|---|
| `Payment` | one payin attempt | `user_id`, `provider`, `provider_order_id`, `provider_payment_id @unique`, `amount_paise Int`, `status`, `method`, `failure_code`, `captured_at`, `idempotency_key @unique` |
| `PaymentEvent` | raw webhook log, replayable | `provider_event_id @unique`, `type`, `payload`, `received_at`, `processed_at` |
| `SessionPack` | purchased entitlement | `user_id`, `payment_id`, `sessions_purchased`, `sessions_remaining`, `price_paise`, `expires_at`, `status` |
| `PackRedemption` | which appointment consumed which pack | `pack_id`, `appointment_id @unique`, `redeemed_at`, `reversed_at` |
| `TherapistEarning` | accrual per delivered session | `therapist_id`, `appointment_id @unique`, `amount_paise`, `status`, `accrued_at`, `payable_at`, `payout_id` |
| `Payout` | one transfer per therapist per period | `therapist_id`, `period_start`, `period_end`, `amount_paise`, `status`, `utr`, `paid_at`, `approved_by`, `method` |
| `Refund` | money back to a user | `payment_id`, `amount_paise`, `reason`, `status`, `provider_refund_id`, `initiated_by`, `processed_at` |
| `LedgerEntry` | append-only double-entry spine | `txn_group`, `account` (enum), `debit_paise`, `credit_paise`, `ref_type`, `ref_id`, `created_at` |

All amounts `Int` **paise**, never `Float`/`Decimal`-as-float. Currency fixed `INR` for now but
stored on the row. No PAN, no bank account numbers, no card data in our database: store the
gateway's contact/beneficiary id plus last-4 only (§2.5 minimisation; also keeps us out of PCI
scope).

### 6.7 Money screens (Phase 3+)

**`/admin/money`.** Six numbers: collected MTD, refunded MTD, net collected, therapist payable
(accrued but unpaid), failed payments 24h, unreconciled rows. Red thresholds in §7.
*Decision:* no revenue chart. At 20 users a chart is decoration; the number and its delta are
the information.

**`/admin/money/payments`.** Table of attempts, filter by status/method/date. Actions: open in
provider, refund (with reason and cap), retry link (provider-hosted, we never handle card
data). *Decision:* refunds are issued from the payment row, never from the user row — the
money object is the subject.

**`/admin/money/packs`.** Per user: purchased, remaining, expiry, consumption list.
*Decision:* an expired pack is shown, not hidden; expiry is a support conversation.

**`/admin/money/payouts`.** Period selector; per therapist: sessions, accrued, held, payable,
paid, UTR. Action: create payout run (draft), mark sent (requires UTR), download statement.
*Decision:* a payout cannot be marked sent without a UTR; "paid" without a bank reference is
how reconciliation dies.

**`/admin/money/reconciliation`.** Last run time, gateway total vs ledger total, count of
orphan payments (captured, no pack), orphan earnings (completed appointment, no earning),
duplicate redemptions. *Decision:* the page shows the *difference*, not both totals side by
side and let the human subtract.

### 6.8 Questions for a chartered accountant — named, not answered

Do not let engineering guess any of these. Each one changes a field or a document.

1. **Merchant of record.** Okuvu collects and pays therapists (principal), or therapists bill
   clients and Okuvu takes commission (agent/marketplace)? Determines GST treatment, invoice
   counterparty, and whether aggregator/ECO provisions apply. **Blocks the data model.**
2. **GST on the bundle.** Is "AI companion + licensed therapist sessions sold as one pack" a
   composite supply, and which is principal? Healthcare services by a clinical establishment
   are treated differently from SaaS; the pack mixes both. Rate, HSN/SAC, and place of supply.
3. **GST registration and threshold.** Current turnover, whether the ₹20 lakh services
   threshold applies, and whether registration is voluntary-but-advisable for B2B credibility.
4. **Time of supply on prepaid packs.** Is GST due when the pack is sold (advance) or when each
   session is delivered? This decides whether `SessionPack` needs a tax split at sale.
5. **TDS on therapist payouts.** Section 194J (professional/technical fees) applicability, rate,
   threshold per payee per year, and whether a per-session flat fee to an individual
   practitioner is "professional fees" or something else. Also: does Okuvu need a declaration/
   Form 16A process, and who files.
6. **Therapist engagement status.** Independent contractor vs employee vs "consultant" — affects
   TDS, PF/ESI exposure, and the payout contract. Not a tax question alone; it is an
   employment-law question.
7. **Invoicing and records.** Invoice numbering and series, e-invoicing threshold, credit notes
   for refunds, retention period for financial records, and whether a payment-gateway receipt
   is sufficient for the customer.
8. **Refunds and credit notes.** Treatment of a pro-rata refund on an expired pack, and whether
   the therapist share already accrued must be clawed back (business decision + tax
   consequence).
9. **International users (if any).** Export of services, LUT, FIRC — only if the pilot leaves
   India. Assume not, confirm.

### 6.9 Size

**Payin (Phase 3): 12–16 engineer-days.** Catalog + pack purchase + Razorpay order/webhook +
idempotent credit + redemption on appointment completion + refunds + reconciliation job +
tests. Add **2–3 days of ops/CA time** that is not engineering.

**Payout (Phase 4): 8–10 engineer-days.** Accrual, payout run, statement, UTR recording,
recon extension, therapist-facing earnings view.

**Invoicing (Phase 5, conditional): 4–5 days** if Q7 says we must issue GST invoices ourselves.

---

## 7. The Today dashboard

### 7.1 Rules

- **Absolute counts, not percentages.** At n=20 a percentage hides the denominator and turns
  one user into 5%. Every tile shows `n / total`.
- **Red means "someone must act today".** Amber means "look this week". Green means nothing —
  no green tiles, no celebratory colour. Absence of red is the success state.
- **Six blocks, fixed order.** Harm → attention → delivery → capacity → goal → money. The
  order is the argument: safety outranks everything, and money is last because it is the least
  urgent thing on a mental-health console.
- **Every tile links to the filtered list that resolves it.** No tile links to a chart.
- **Stale data is labelled.** Each block shows its `as of` time; if a source query fails, the
  block says "unavailable", never zero.

### 7.2 The blocks

**Block 1 — Safety (always first; red banner across the page if any red).**

| Tile | Definition | Red | Amber |
|---|---|---|---|
| Crisis flags, 24h | `SessionLog.crisis_flag_detected = true` in last 24h | ≥1 with no `ClinicalAccessLog` for that client since the flag | ≥1, all reviewed |
| Users in S3/S4 | `SafetyState.safety_state_current ∈ {S3,S4}` | ≥1 | — |
| Crisis flags, 7d trend | count, with prior 7d for comparison | rising and ≥3 | rising |

Business admin sees the counts; the names are one click away only for the supervisor. If a
business admin clicks a red crisis tile, they get "1 client in crisis — supervisor notified
at HH:MM" plus a "notify supervisor" button, not the client's name.

**Block 2 — Attention (coverage gaps).**

| Tile | Definition | Red | Amber |
|---|---|---|---|
| Unredeemed invites > 48h | `InviteToken` unredeemed, `created_at` < now-48h, not expired | ≥3 | 1–2 |
| Activated, no session 7d | `TherapistClient.activated_at` set, no `SessionLog` in 7d | ≥3 | 1–2 |
| Unassigned > 24h | `User` with no active assignment, `created_at` < now-24h | ≥1 | — |
| Double-assigned | 2+ active assignments for one user | ≥1 | — |
| Appointments past, not followed up | `Appointment` past, not cancelled, no `TherapistNote`/`SessionLog` within 48h after | ≥2 | 1 |

**Block 3 — Delivery (last 7 days).**

| Tile | Definition | Red | Amber |
|---|---|---|---|
| Sessions completed | `Appointment.completed_at` in 7d (Phase 3) / scheduled-and-past (Phase 1) | < 80% of sessions scheduled | 80–99% |
| Sessions scheduled next 7d | upcoming, not cancelled | 0 while ≥5 active clients | < active clients |
| Chat sessions 7d | `SessionLog` count | 0 for ≥3 active clients | decline >30% w/w |
| Median days since last contact | per active client | > 7 | 4–7 |

**Block 4 — Therapist capacity.**

| Tile | Definition | Red | Amber |
|---|---|---|---|
| Active load per therapist | active assignments / capacity | > capacity | ≥ 90% |
| Therapist with 0 sessions 7d but ≥3 clients | derived | ≥1 | — |
| Inactive therapist 14d | no `ClinicalAccessLog`, no `Appointment` | ≥1 | — |

**Block 5 — Pilot targets.**

| Tile | Definition | Red | Amber |
|---|---|---|---|
| Activated users | `TherapistClient.activated_at` not null, distinct users | < 60% of target (20 → <12) | 60–89% |
| Sessions delivered vs target | vs 15 | < 10 | 10–14 |
| Outcome measures collected | `OutcomeMeasure` count (Phase 2+) | 0 | < 50% of active |
| Feedback forms returned | manual count until a form exists | — | — |

**Block 6 — Money (Phase 3+; block absent before that, not zeroed).**

| Tile | Definition | Red | Amber |
|---|---|---|---|
| Failed payments 24h | `Payment.status=FAILED` | ≥1 | — |
| Unreconciled rows | from the recon job | ≥1 | — |
| Therapist payable | `TherapistEarning` accrued, unpaid, past hold | > 45 days old | > 30 days |
| Refunds pending | `Refund.status` not processed > 48h | ≥1 | — |

### 7.3 Not on the dashboard

No charts. No revenue graph. No per-therapist mood averages. No "engagement score". No
"users at risk" ML ranking — with 20 users the admin knows them by name, and a model would be
invented authority.

---

## 8. Build order

Sizes are engineer-days for one full-stack engineer who knows this repo, including tests, not
including review latency. Clinical sign-off and CA answers are calendar time, not engineering
time, and are the real critical path.

| Phase | Scope | Size | Exit criterion |
|---|---|---|---|
| **P0 — Role foundation** | `Therapist.role`, `is_active`, `capacity`; `requireAdminRole()`; dual-check `ADMIN_EMAILS` for one release; audit role changes; backfill existing rows to `THERAPIST`, admins to `BUSINESS_ADMIN` | **1.5d** | A non-therapist ops email can sign in and reach `/admin` without a clinical caseload; a plain therapist cannot. |
| **P1 — Pilot operations (no money)** | Today (blocks 1–5, counts only), `/admin/roster` + `[userId]`, `/admin/therapists` + `[id]`, reassign + end, partial unique index, `Appointment.completed_at`, CSV export of roster | **8d** | The `03-participant-roster.md` table is no longer updated by hand for a full week. |
| **P2 — Clinical & break-glass** | `/admin/clinical` + detail, `AdminAccessLog`, break-glass flow, access-log page, audit wiring, 24h review queue | **7d** (+2d clinical design) | Supervisor runs a full week from the console; one break-glass exercised in a drill, reviewed, and found in `AuditEvent`. |
| **P2.5 — Outcome measure (optional, clinical-gated)** | `OutcomeMeasure` model, app form, scoring, escalation rule, supervisor view | **3–4d** | First 10 users have intake scores; Shubhangi signs the instrument + escalation rule first. |
| **P3 — Payin** | Pack catalog, purchase, Razorpay orders/webhooks, `PaymentEvent`, pack credit/redemption, refunds, payment + pack screens, recon job | **12–16d** | One real ₹ payment end-to-end; refund executed; recon shows zero differences for 7 days. |
| **P4 — Payout** | Accrual, payout run, statements, UTR, therapist earnings view, recon extension | **8–10d** | One full monthly cycle paid with UTRs that match bank statements. |
| **P5 — Invoicing (conditional)** | GST invoice generation/numbering if Q7 requires it | **4–5d** | CA accepts the invoice format. |

**Total to a money-complete console: ~40–46 engineer-days** (P0–P4), of which only ~9.5 are needed
before the pilot can run. That sequencing is the point of the document.

### What can be deferred, and what cannot

Safe to defer: subscriptions and auto-renew; coupons/referrals; multi-currency; therapist
self-serve KYC; automated payouts (manual + UTR is fine for 3 therapists); invoice automation;
any analytics warehouse; cohort/retention charts; mobile admin; bulk actions; notification
preferences; SSO.

Cannot be deferred once the related phase ships: the partial unique index (§4.3 R1), break-glass
logging (§2.4), the reconciliation job (§6.5), the payout UTR requirement (§6.3). Each of these
is the difference between a console and a liability.

### Dependencies and risks

| Risk | Impact | Mitigation |
|---|---|---|
| CA answers (§6.8 Q1/Q4) arrive late | Payin model changes after build | Build P3 against `Payment`+`SessionPack` with a `tax_treatment` field left null; do not build invoicing until answered |
| Client-facing consent for chat access does not exist | Break-glass is the only admin path; DPDP posture is thin | Phase 2 adds a consent record; until then, cap business-admin break-glass (§2.4.9) |
| `Appointment` has no attendance | "Sessions delivered" is inferred | `completed_at` in P1, before any money depends on it |
| Two-person team, no separation of duty | Break-glass and payouts depend on the same person | Self-review flag + audit trail; do not build an approval workflow that will be bypassed |
| No push/SMS infrastructure | "Notify supervisor" is email-only | Use the existing Brevo transport; say "emailed", never "notified" |
| Partial unique index vs Prisma migrations | Drift, failed deploy | Raw-SQL migration documented per `docs/prisma-migration-drift.md`; verify with a constraint test |

---

## 9. Open questions

**For Rajwant (business model — every one of these is a hypothesis above):**

1. Does the user pay for therapist sessions, the AI companion, or a bundle? (§6.2 assumes
   sessions, AI free.)
2. Pack size, price, expiry, and therapist share — the ₹6,000 / ₹1,000 / 10-week numbers are
   placeholders for a decision, not a proposal to defend.
3. Is the pilot free? If yes, P3/P4 have no deadline and P1 is the whole product for now.
4. Who is the merchant of record, commercially — Okuvu or the therapist? (Also CA Q1.)
5. Is the 20-user target a hard number? It sets every red threshold in §7.

**For Shubhangi (clinical — none of these are the PM's to decide):**

6. Which outcome instrument(s), at what cadence, and what happens on a severe score? (§5.4)
7. Is `session_feedback_score` 1–4 "higher is better"? The code validates the range but does
   not document the direction.
8. What copy does a client see when their therapist changes? (§4.3 R2)
9. Is any pilot participant a minor? If so, §2.5's children question blocks the console.

**For legal/CA:** §6.8, all nine. Plus retention periods for `AdminAccessLog` and `AuditEvent`.

**For engineering:** whether `ADMIN_EMAILS` can be deleted in the same release as P0 (the
dual-check is a safety net, not a destination).
