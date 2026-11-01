# Admin Console — Data Model, Queries and Build Breakdown

Companion to [`admin-console-spec.md`](./admin-console-spec.md). That document decides *what*
the console is; this one decides *what it is made of* — exact Prisma models, the SQL behind each
dashboard number, the migration order, and the engineering breakdown that produces the sizes in
§8 of the spec.

Everything here is additive. No existing model loses a field, no existing row is rewritten
except `Therapist.role` (backfilled to `THERAPIST`).

---

## 1. Existing schema: what we are building on

Verified against `packages/prisma/schema.prisma` at `c3caa7a` (38 models, no money models).

| Model | Fields the console depends on | Gap |
|---|---|---|
| `User` | `id`, `phone_number`, `email`, `full_name`, `created_at`, `deleted_at`, `language_mode` | — |
| `Therapist` | `id`, `email`, `name`, `created_at` | **no `role`, `is_active`, `capacity`** |
| `TherapistClient` | `therapist_id`, `client_user_id`, `chat_access_granted`, `chat_access_requested_at`, `activated_at`, `ended_at`, `created_at`; unique on the pair | **no global uniqueness per client**; no reassignment procedure |
| `Appointment` | `therapist_id`, `client_user_id`, `scheduled_at`, `duration_minutes`, `mode`, `cancelled_at`, `rescheduled_from` | **no `completed_at` / attendance** |
| `SessionLog` | `session_started_at`, `session_ended_at`, `turn_count`, `session_feedback_score` (1–4), `crisis_flag_detected` | — |
| `SessionSummary` | `summary_text`, `status`, `created_at` | — |
| `MoodLog` | `mood_value` (1–5), `date_ist`, unique per user per date | no anchors on the scale |
| `SafetyState` | `safety_state_current` (S0–S4) | — |
| `ClinicalAccessLog` | `therapist_id`, `client_user_id`, `action`, `created_at` | **`therapist_id` is non-null; no reason/actor-role → cannot express an admin** |
| `AuditEvent` | `seq`, `actor`, `action`, `object`, `at`, `body`, `prev_hash`, `hash` | correct as-is; append-only hash chain |
| `Homework` | `status`, `assigned_at` | completion is therapist-marked |
| `TherapistNote` | `note_text`, `created_at` | — |
| `InviteToken` | `created_at`, `expires_at`, `redeemed_at` | — |
| `EngagementProfile` | `current_streak`, `last_session_date` | — |
| `UserMemory` | `homework_track`, `emotional_baseline` | — |
| `TestBudget` | `monthly_cap_inr` | the only "INR" field in the schema |

Design consequence: the access model is one column away from being expressible, and the
clinical-access log is one *table* away. Both are small. Money is not.

---

## 2. New Prisma models

### 2.1 Identity and roles (P0)

```prisma
enum AdminRole {
  THERAPIST
  CLINICAL_SUPERVISOR
  BUSINESS_ADMIN
}

model Therapist {
  // ...existing fields unchanged...
  role            AdminRole @default(THERAPIST)
  is_active       Boolean   @default(true)
  /// Soft cap used for load warnings only (spec §4.3 R4). Null = no cap set.
  capacity        Int?
  /// Gateway-side beneficiary/contact id (e.g. RazorpayX contact). We never store
  /// PAN or full bank details in this database — last4 only, for display.
  payout_contact_id     String?
  payout_account_last4  String?
  /// Last time this therapist loaded a clinical surface. Cheap "are they working"
  /// signal that does not require scanning ClinicalAccessLog on every dashboard load.
  last_clinical_access_at DateTime?

  admin_access_logs AdminAccessLog[] @relation("AdminActor")
}

model AdminAccessLog {
  id             String    @id @default(uuid())
  /// Session email, not FK: an admin may be deactivated and their Therapist row
  /// kept for history; the log must survive that.
  actor_email    String
  actor_role     AdminRole
  actor_therapist_id String?
  client_user_id String
  /// Closed list: crisis_followup | complaint_investigation | legal_request |
  /// clinical_audit | engineering_incident
  trigger        String
  reason         String
  /// transcript_window | summaries | journal | memory
  scope          String
  ticket_ref     String?
  granted_at     DateTime  @default(now())
  expires_at     DateTime
  ended_at       DateTime?
  reviewed_at    DateTime?
  reviewed_by    String?
  self_reviewed  Boolean   @default(false)

  actor  Therapist? @relation("AdminActor", fields: [actor_therapist_id], references: [id])
  client User       @relation("ClientToAdminAccess", fields: [client_user_id], references: [id], onDelete: Cascade)

  @@index([client_user_id, granted_at(sort: Desc)])
  @@index([actor_email, granted_at(sort: Desc)])
  @@index([reviewed_at])
}
```

`User` gains `admin_access_logs AdminAccessLog[] @relation("ClientToAdminAccess")`.

Why a new table instead of extending `ClinicalAccessLog`: that table's contract is "a therapist
read a client's clinical record", its `therapist_id` is non-null, and it is already consumed by
the report-card path (`logClinicalAccess`). Widening it to carry admin reasons would either
weaken its constraint or make every existing reader handle rows that are not therapist reads.
A separate table keeps both meanings clean, and both are surfaced on `/admin/access-log`.

Note the split of duties: **routine supervision** reads are ordinary clinical reads and write
`ClinicalAccessLog` as `SUPERVISOR_VIEW_*` (the supervisor has a `Therapist` row, so the
existing non-null FK fits). **Break-glass** — an admin opening raw conversation — writes
`AdminAccessLog` *and* `AuditEvent`, because it is not a clinical read by a clinician and must
carry a reason and an expiry.

### 2.2 Appointment completion (P1)

```prisma
model Appointment {
  // ...existing fields unchanged...
  completed_at DateTime?
  /// attended | no_show_client | no_show_therapist | cancelled_by_client |
  /// cancelled_by_therapist. Null until the slot resolves.
  attendance   String?
  completion_note String?

  earnings TherapistEarning[]
}
```

`completed_at` is what makes "sessions delivered" a fact rather than an inference, and it is the
accrual trigger for therapist earnings (P4). It must land in P1, before any money depends on it.

### 2.3 Money (P3/P4)

```prisma
enum PaymentProvider { RAZORPAY }
enum PaymentStatus { CREATED AUTHORIZED CAPTURED FAILED CANCELLED REFUNDED PARTIALLY_REFUNDED }
enum PackStatus    { ACTIVE EXHAUSTED EXPIRED REFUNDED }
enum EarningStatus { ACCRUED HELD PAYABLE PAID REVERSED }
enum PayoutStatus  { DRAFT APPROVED SENT PAID FAILED }
enum RefundStatus  { REQUESTED PROCESSING PROCESSED FAILED }
enum LedgerAccount {
  CASH_SETTLED
  CUSTOMER_PREPAID
  REVENUE_SESSIONS
  THERAPIST_PAYABLE
  REFUNDS
  GATEWAY_FEES
  TAX_PAYABLE
  ADJUSTMENTS
}

model Payment {
  id                  String          @id @default(uuid())
  user_id             String
  provider            PaymentProvider @default(RAZORPAY)
  /// Gateway order id (created server-side before checkout).
  provider_order_id   String          @unique
  /// Null until the gateway confirms. Unique when present — the idempotency key
  /// for "this captured payment exists exactly once".
  provider_payment_id String?         @unique
  amount_paise        Int
  currency            String          @default("INR")
  status              PaymentStatus   @default(CREATED)
  /// upi | card | netbanking | wallet — gateway-reported, free string.
  method              String?
  failure_code        String?
  failure_reason      String?
  /// Client-supplied idempotency key for our own create-order endpoint.
  idempotency_key     String          @unique
  captured_at         DateTime?
  created_at          DateTime        @default(now())
  updated_at          DateTime        @updatedAt

  user     User             @relation(fields: [user_id], references: [id])
  pack     SessionPack?
  refunds  Refund[]
  events   PaymentEvent[]

  @@index([user_id, created_at(sort: Desc)])
  @@index([status, created_at(sort: Desc)])
}

/// Raw webhook rows. One row per provider event, processed idempotently.
/// Without this, a missed webhook is an untraceable revenue gap.
model PaymentEvent {
  id                String   @id @default(uuid())
  provider          PaymentProvider @default(RAZORPAY)
  provider_event_id String   @unique
  type              String
  payload           String   // canonical JSON text, not Json (byte-stable for replay)
  received_at       DateTime @default(now())
  processed_at      DateTime?
  error             String?
  payment_id        String?

  payment Payment? @relation(fields: [payment_id], references: [id])

  @@index([type, received_at(sort: Desc)])
}

model SessionPack {
  id                 String     @id @default(uuid())
  user_id            String
  payment_id         String     @unique
  sessions_purchased Int
  sessions_remaining Int
  price_paise        Int
  currency           String     @default("INR")
  status             PackStatus @default(ACTIVE)
  purchased_at       DateTime   @default(now())
  expires_at         DateTime
  /// Set when GST treatment is confirmed (spec §6.8 Q4). Null = not yet decided;
  /// deliberately not defaulted, so nobody assumes.
  tax_treatment      String?

  user        User             @relation(fields: [user_id], references: [id])
  payment     Payment          @relation(fields: [payment_id], references: [id])
  redemptions PackRedemption[]

  @@index([user_id, status])
  @@index([expires_at, status])
}

model PackRedemption {
  id             String    @id @default(uuid())
  pack_id        String
  appointment_id String    @unique
  redeemed_at    DateTime  @default(now())
  /// Set on refund/cancellation of the appointment; the credit returns to the pack.
  reversed_at    DateTime?

  pack        SessionPack @relation(fields: [pack_id], references: [id])
  appointment Appointment @relation(fields: [appointment_id], references: [id])

  @@index([pack_id, redeemed_at])
}

model TherapistEarning {
  id             String        @id @default(uuid())
  therapist_id   String
  appointment_id String        @unique
  amount_paise   Int
  status         EarningStatus @default(ACCRUED)
  accrued_at     DateTime      @default(now())
  /// accrued_at + 7 days (spec §6.3). Payable only after this.
  payable_at     DateTime
  payout_id      String?
  reversed_reason String?

  therapist   Therapist   @relation(fields: [therapist_id], references: [id])
  appointment Appointment @relation(fields: [appointment_id], references: [id])
  payout      Payout?     @relation(fields: [payout_id], references: [id])

  @@index([therapist_id, status, payable_at])
  @@index([payout_id])
}

model Payout {
  id           String       @id @default(uuid())
  therapist_id String
  period_start DateTime
  period_end   DateTime
  amount_paise Int
  status       PayoutStatus @default(DRAFT)
  method       String       @default("bank_transfer")
  /// Bank UTR / gateway transfer id. Required before status=SENT (spec §6.3).
  utr          String?
  paid_at      DateTime?
  approved_by  String?
  notes        String?
  created_at   DateTime     @default(now())
  updated_at   DateTime     @updatedAt

  therapist Therapist         @relation(fields: [therapist_id], references: [id])
  lines     TherapistEarning[]

  @@unique([therapist_id, period_start, period_end])
  @@index([status, period_end])
}

model Refund {
  id                 String       @id @default(uuid())
  payment_id         String
  amount_paise       Int
  reason             String
  status             RefundStatus @default(REQUESTED)
  provider_refund_id String?      @unique
  initiated_by       String
  created_at         DateTime     @default(now())
  processed_at       DateTime?

  payment Payment @relation(fields: [payment_id], references: [id])

  @@index([payment_id])
  @@index([status, created_at(sort: Desc)])
}

/// Append-only double-entry spine. One txn_group must balance:
/// sum(debit_paise) = sum(credit_paise). Never updated, never deleted.
model LedgerEntry {
  id          String        @id @default(uuid())
  txn_group   String
  account     LedgerAccount
  debit_paise Int           @default(0)
  credit_paise Int          @default(0)
  ref_type    String
  ref_id      String
  created_at  DateTime      @default(now())

  @@index([txn_group])
  @@index([account, created_at])
  @@index([ref_type, ref_id])
}
```

Also add the back-relations the Prisma compiler will demand: `User.payments Payment[]`,
`User.packs SessionPack[]`, `Therapist.earnings TherapistEarning[]`,
`Therapist.payouts Payout[]`, `Appointment.redemption PackRedemption?`.

### 2.4 Outcome measure (P2.5, clinical-gated)

```prisma
model OutcomeMeasure {
  id             String   @id @default(uuid())
  user_id        String
  /// PHQ9 | GAD7 — exact set is Shubhangi's decision (spec §5.4).
  instrument     String
  score          Int
  max_score      Int
  /// client | therapist
  administered_by String
  administered_at DateTime @default(now())
  /// Which care plan was active at administration; lets the supervisor compare
  /// like with like without joining ClinicalConfig's current (overwritten) row.
  care_plan_at_administration String?
  created_at     DateTime @default(now())

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id, instrument, administered_at(sort: Desc)])
}
```

`User.outcome_measures OutcomeMeasure[]`.

### 2.5 Deliberately not modelled

- **Invoice** — pending CA Q7. If GST invoices are required, this is a P5 model
  (`number @unique`, `payment_id`, `issued_at`, `taxable_paise`, `cgst_paise`, `sgst_paise`,
  `igst_paise`, `pdf_key`).
- **Therapist KYC documents** — PAN/bank proof stay with the payout provider, not us.
- **Pack catalog / products** — a 4-session pack at one price is a constant, not a table. Add
  `PackProduct` only when there are two real SKUs.
- **Subscription / mandate** — explicitly out of scope (spec §6.2).

---

## 3. The queries behind the console

Postgres, read-only, no ORM required for the aggregates. Each is listed with the index it leans
on; at 20 users none of this is slow, but the indexes are cheap and the queries are the spec.

### 3.1 Active load per therapist

```sql
SELECT t.id, t.name, t.email, t.capacity,
       COUNT(tc.id) FILTER (WHERE tc.ended_at IS NULL AND tc.activated_at IS NOT NULL) AS active_clients,
       COUNT(tc.id) FILTER (WHERE tc.ended_at IS NULL AND tc.activated_at IS NULL)     AS pending_clients
FROM "Therapist" t
LEFT JOIN "TherapistClient" tc ON tc.therapist_id = t.id
WHERE t.is_active
GROUP BY t.id
ORDER BY active_clients DESC;
```

### 3.2 The gap list (Q1)

```sql
-- unassigned, older than 24h
SELECT u.id, u.full_name, u.phone_number, u.created_at
FROM "User" u
WHERE u.deleted_at IS NULL
  AND u.created_at < now() - interval '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM "TherapistClient" tc
    WHERE tc.client_user_id = u.id AND tc.ended_at IS NULL
  );

-- activated, no chat session in 7 days
SELECT u.id, u.full_name, max(sl.session_started_at) AS last_session
FROM "User" u
JOIN "TherapistClient" tc ON tc.client_user_id = u.id AND tc.ended_at IS NULL
LEFT JOIN "SessionLog" sl ON sl.user_id = u.id
WHERE tc.activated_at IS NOT NULL AND u.deleted_at IS NULL
GROUP BY u.id
HAVING max(sl.session_started_at) IS NULL
    OR max(sl.session_started_at) < now() - interval '7 days';

-- invites unredeemed > 48h, not yet expired
SELECT it.id, it.client_user_id, it.created_at, u.full_name, u.email
FROM "InviteToken" it
JOIN "User" u ON u.id = it.client_user_id
WHERE it.redeemed_at IS NULL
  AND it.created_at < now() - interval '48 hours'
  AND it.expires_at > now();
```

### 3.3 Double-assignment alarm (should return zero after R1)

```sql
SELECT client_user_id, COUNT(*) AS active_assignments
FROM "TherapistClient"
WHERE ended_at IS NULL
GROUP BY client_user_id
HAVING COUNT(*) > 1;
```

### 3.4 Sessions delivered / scheduled

```sql
-- delivered, last 7 days (P1+ uses completed_at; before that, this is an inference)
SELECT count(*) FROM "Appointment"
WHERE completed_at >= now() - interval '7 days';

-- scheduled next 7 days
SELECT count(*) FROM "Appointment"
WHERE cancelled_at IS NULL AND completed_at IS NULL
  AND scheduled_at BETWEEN now() AND now() + interval '7 days';
```

### 3.5 Mood trend with adherence (spec §5.3)

```sql
WITH days AS (
  SELECT count(DISTINCT date_ist) AS logged_days,
         count(*)                 AS n,
         avg(mood_value)          AS mean
  FROM "MoodLog"
  WHERE user_id = $1 AND date_ist >= current_date - 28
)
SELECT d.*,
       (SELECT count(*) FROM generate_series(current_date - 28, current_date, '1 day')) AS window_days,
       -- slope via least squares; small n, so expose the value, never a forecast
       regr_slope(mood_value, date_ist::date - (current_date - 28)) AS slope_per_day
FROM days d
LEFT JOIN "MoodLog" m ON m.user_id = $1 AND m.date_ist >= current_date - 28
GROUP BY d.logged_days, d.n, d.mean;
```

Render rule: `mean ± n/28`. If `n < 7`, show "insufficient data", never a trend arrow.

### 3.6 Therapist activity

```sql
SELECT t.id,
       max(cal.created_at)                              AS last_clinical_access,
       count(a.id) FILTER (WHERE a.completed_at >= now() - interval '7 days') AS delivered_7d
FROM "Therapist" t
LEFT JOIN "ClinicalAccessLog" cal ON cal.therapist_id = t.id
LEFT JOIN "Appointment" a ON a.therapist_id = t.id
WHERE t.is_active
GROUP BY t.id;
```

### 3.7 Reconciliation (nightly)

```
1. gateway_settled  = sum of captured payments per provider report for the day
2. ledger_cash      = sum(debit) on CASH_SETTLED for the day
3. assert |1 - 2| = 0, else open a discrepancy row per payment id
4. assert every CAPTURED Payment has exactly one SessionPack  (orphan_payment)
5. assert every COMPLETED Appointment has exactly one non-reversed TherapistEarning (orphan_earning)
6. assert every non-reversed PackRedemption has a pack whose remaining >= 0
7. assert sum(THERAPIST_PAYABLE debits - credits) = sum(TherapistEarning.amount where status in (ACCRUED,HELD,PAYABLE))
8. write one ReconRun row (day, totals, discrepancy counts) — surfaced on /admin/money/reconciliation
```

`ReconRun` is a ninth money model if we want history (`id`, `run_at`, `gateway_paise`, `ledger_paise`,
`diff_paise`, `orphan_payments`, `orphan_earnings`, `notes`). It is three fields of value and
one hour of work; include it in P3.

### 3.8 New indexes

```sql
-- spec §4.3 R1: the integrity rule, expressed once
CREATE UNIQUE INDEX therapist_clients_one_active_per_client
  ON "TherapistClient" (client_user_id)
  WHERE ended_at IS NULL;

CREATE INDEX therapist_clients_therapist_active
  ON "TherapistClient" (therapist_id, ended_at, activated_at);

CREATE INDEX users_created_at ON "User" (created_at) WHERE deleted_at IS NULL;
CREATE INDEX appointments_completed_at ON "Appointment" (completed_at);
```

Prisma cannot express partial/`WHERE` indexes. These go in a raw-SQL migration (see
`docs/prisma-migration-drift.md` for the house convention on hand-written migrations) and are
verified by a test that inserts a second active assignment and expects a unique violation.

---

## 4. Migration plan

Three migrations, each independently revertible. Deploy order is not negotiable: role before
routes, completion before money.

### M1 (P0) — roles

```sql
CREATE TYPE "AdminRole" AS ENUM ('THERAPIST','CLINICAL_SUPERVISOR','BUSINESS_ADMIN');
ALTER TABLE "Therapist"
  ADD COLUMN role "AdminRole" NOT NULL DEFAULT 'THERAPIST',
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN capacity integer,
  ADD COLUMN last_clinical_access_at timestamp;
-- promote the existing env-listed admins by hand, once:
UPDATE "Therapist" SET role='BUSINESS_ADMIN' WHERE email = ANY($ADMIN_EMAILS);
```

Backfill is a default, so no row scan risk. Rollback: drop the columns; `ADMIN_EMAILS` still
works because the middleware keeps the OR-branch for one release.

### M2 (P1) — appointment completion, indexes, access log

```sql
ALTER TABLE "Appointment"
  ADD COLUMN completed_at timestamp,
  ADD COLUMN attendance text,
  ADD COLUMN completion_note text;

-- backfill: treat past, uncancelled appointments as attended for reporting only.
-- Explicitly labelled as an inference; do not create earnings from this backfill.
UPDATE "Appointment" SET completed_at = scheduled_at + (duration_minutes || ' minutes')::interval,
       attendance = 'attended'
WHERE cancelled_at IS NULL AND scheduled_at < now() - interval '1 hour';
```

Then the unique index. **Run the duplicate check first** (§3.3); if it returns rows, resolve
them by hand (end all but the oldest) before creating the index, or the migration fails in
production.

Expected duplicates today: unknown, because nothing prevented them. Budget half a day for
cleanup and treat "zero rows" as a pre-migration gate, not a hope.

### M3 (P3) — money

Pure additive `CREATE TABLE` + enums. No backfill. Ship with the tables dark (routes behind a
feature flag) and turn on only after a real gateway test-mode payment round-trips: order →
capture → webhook → pack → redemption → refund.

### Dual-read window

For one release after M1, `requireAdminRole()` accepts `role ∈ {BUSINESS_ADMIN,
CLINICAL_SUPERVISOR}` **or** `email ∈ ADMIN_EMAILS`, and logs which branch matched. Remove the
env branch once the log shows zero env-only matches for a week. This is a safety net for the
deploy, not a permanent compatibility layer.

---

## 5. Engineering breakdown

Sizes assume one full-stack engineer familiar with the repo, including tests but excluding
review latency. Matches spec §8.

### P0 — Role foundation (1.5d)

| Task | Size |
|---|---|
| M1 migration + enum + backfill script | 0.25 |
| `requireAdminRole()` + `amIAdmin` returns role; dual-check + branch logging | 0.5 |
| Route-level server checks for `/admin/*`; sidebar nav filtered by role | 0.25 |
| Tests: three roles × three routes; env fallback; role change audit | 0.5 |

### P1 — Pilot operations (8d)

| Task | Size |
|---|---|
| M2 migration + duplicate cleanup + unique index test | 1.0 |
| `admin.roster.list` (filters: gap/pending/unassigned/inactive/ended) + pagination | 1.25 |
| `admin.roster.detail` (assignment history, invites, appointments, pack stub) | 0.5 |
| `reassignClient` + `endAssignment` + audit + Brevo email | 1.0 |
| `/admin` Today blocks 1–5 (server components + one aggregate query module) | 1.75 |
| `/admin/roster` + `[userId]`, `/admin/therapists` + `[id]`, reusing existing components, incl. CSV export | 1.75 |
| Tests: reassign invariants, gap definitions, threshold rendering | 0.75 |
| **Total** | **8** |

### P2 — Clinical & break-glass (7d)

| Task | Size |
|---|---|
| `AdminAccessLog` model + migration | 0.5 |
| Break-glass grant/expiry middleware (server-enforced 60min, scope check) | 1.5 |
| `/admin/clinical` list + detail, with `logClinicalAccess` on every render | 1.5 |
| Break-glass UI: trigger, reason validation, consent banner, countdown | 1.0 |
| `/admin/access-log` + 24h review queue + self-review flag | 1.0 |
| `AuditEvent` wiring for open/close/role-change | 0.5 |
| Tests: expiry, scope, review, business-admin cap | 1.0 |

### P2.5 — Outcome measure (3–4d, after clinical sign-off)

Schema 0.5 · API 0.75 · Flutter form 1.0 · scoring + severe-range rule 0.5 · supervisor view 0.5
· tests 0.5.

### P3 — Payin (12–16d)

| Task | Size |
|---|---|
| M3 money tables + `ReconRun` | 1.0 |
| Pack purchase API: create order (idempotency), return checkout payload | 1.5 |
| Razorpay webhook: signature verify, `PaymentEvent` dedupe, state machine | 3.0 |
| Pack credit + redemption on appointment completion (transactional) | 1.5 |
| Refunds (full/partial, cap, provider call, ledger) | 2.0 |
| `/admin/money` + payments + packs screens | 2.5 |
| Recon job + reconciliation screen | 2.0 |
| Tests: webhook replay, double-credit, refund cap, recon fixtures | 2.5 |
| **Total** | **16** at the high end; 12 if the refund path ships manual-first |

### P4 — Payout (8–10d)

Accrual on completion 1.0 · payout run + period locking 2.5 · statement + therapist view 1.5 ·
UTR/paid marking + audit 1.0 · recon extension 1.5 · tests 1.5.

### P5 — Invoicing (4–5d, conditional on CA Q7)

Model + numbering 1.0 · PDF generation 1.5 · credit notes for refunds 1.0 · screens 0.5 ·
tests 0.5.

### Cumulative

| Through | Days |
|---|---|
| P0 | 1.5 |
| P0+P1 | 9.5 |
| +P2 | 16.5 |
| +P2.5 | ~20 |
| +P3 | ~36 |
| +P4 | ~45 |
| +P5 | ~50 |

Cumulative uses the high end of P3's range (16d) and the midpoints of P4/P5; P0–P4 therefore
lands between ~40 and ~46 days depending on how much of the refund path ships manual-first.

---

## 6. Failure modes this model is designed to prevent

| Failure | Prevented by |
|---|---|
| An admin reads a transcript with no record | `AdminAccessLog` (queryable) + `AuditEvent` (tamper-evident) + 60-min expiry |
| A client ends up with two therapists after a reassignment | Partial unique index + single-transaction `reassignClient` |
| Consent silently transfers to a new therapist | `chat_access_granted = false` on the new row, enforced in the procedure |
| A webhook is delivered twice and credits two packs | `PaymentEvent.provider_event_id @unique` + `Payment.provider_payment_id @unique` |
| A therapist is paid twice for the same session | `TherapistEarning.appointment_id @unique` |
| A refund leaves the ledger unbalanced | `LedgerEntry` double-entry + nightly balance assertion |
| "Collected" ≠ "in the bank" | `Payment.status=CAPTURED` vs `CASH_SETTLED` ledger account, reconciled daily |
| A payout is marked paid with no bank reference | `utr` required before `PayoutStatus.SENT` |
| "Sessions delivered" is a guess | `Appointment.completed_at` set explicitly, backfill labelled as inference |
| A clinical threshold is changed from the console | No write path exists to `ClinicalConfig.care_plan_id` from admin routes; `PromptRegistryEntry`, `CrisisResource`, `ModelConfigPin` have no admin mutations at all |
