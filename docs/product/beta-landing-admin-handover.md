# Beta landing page + admin console — handover

Branch: `feat/landing-and-admin-beta` (off `develop`, commit `7ec92e2` + docs).
Specs: `landing-page-spec.md`, `landing-page-copy.md`, `admin-console-spec.md`,
`admin-console-data-model.md`.

## What now exists

**Landing page at `/`** — public, no session needed, served on every hostname
the ALB answers for (`okuvu.in`, `www.okuvu.in`). `portal.okuvu.in` is
exempted on purpose: it redirects `/` to `/dashboard` as it always did, so an
existing therapist bookmark does not land on marketing copy. `/dashboard` and
`/clients/...` are unchanged everywhere.

**Admin console at `/admin`** — six sections. Reached only by an address on
`ADMIN_EMAILS`; a signed-in therapist who is not on the list sees a clear
"restricted" panel rather than a 403.

**Google sign-in** — added to `/auth` and to the landing page's therapist
block, alongside Cognito. Off unless both env vars are present.

## What only you can do

### 1. Create the Google OAuth client (5 minutes, one time)

Google Cloud Console → **APIs & Services → Credentials → Create credentials →
OAuth client ID → Web application**, then add exactly these under
*Authorised redirect URIs*:

```
https://www.okuvu.in/api/auth/callback/google
https://okuvu.in/api/auth/callback/google
```

Copy the **client ID** and **client secret**.

Paste them to me. I will store the secret in Secrets Manager and set the two
terraform variables; you never need to touch the console again for this.

If you would rather not use Google at all, say so and therapists fall back to
the existing Cognito email + password — the page hides the Google button by
itself.

### 2. Create the operator account

`admin@okuvu.in` is the allowlist entry. It needs to exist as a Google account
in the okuvu.in Workspace tenant (it probably already does). Set:

```
ADMIN_EMAILS="admin@okuvu.in"
```

That is the whole setup — an allowlisted address signs in without a Therapist
row and lands on `/admin`.

### 3. Register therapists

Admin console → **Therapists → Add a therapist**, personal email, done. That
row is the allowlist: with a Google account they can sign in immediately, and
there is no signup path anywhere in the product.

## What deployment needs from me, once you have the OAuth client

1. Secrets Manager: store the client secret under key `secret`.
2. `terraform.tfvars`: `google_client_id`, `google_client_secret_arn`,
   `admin_emails = "admin@okuvu.in"`.
3. `terraform apply` (portal task definition only — new revision, no downtime
   beyond the usual rolling replace).
4. Verify: `/` renders signed-out, `/auth` shows "Continue with Google",
   `admin@okuvu.in` lands on `/admin`.

## Deliberately absent, and why

| Not there | Why |
| --- | --- |
| Download button / Play badge | E19-S1 is not started; there is no listing to link to |
| Prices, plans, trial | No billing tables exist. `paymentsStatus` returns `enabled: false`, never a zero that reads as revenue |
| Full crisis block | Clinical deliverable. The page ships one line, "call 112" |
| Therapist signup | The Therapist table is the allowlist. A signup form would undo the invite model |
| Conversation content in admin | An operator may see engagement counts, never what a client wrote |
| Chat access for admin | `TherapistClient.chat_access_granted` is the client's consent, not the operator's |

## Verification status

- 209 unit tests pass (was 131): Google callback + provider list, waitlist
  route, copy claim guard, console queries and access control.
- Production build succeeds; `/` verified live at desktop and mobile widths;
  `/admin` verified rendering its shell and tabs; `/api/health` unchanged.
- The console's data views were **not** exercised against a live database:
  this host has no Postgres and no Docker daemon, so the queries are covered
  by unit tests (fake Prisma context) rather than a click-through. First thing
  to check on the deployed stack is Today/Clients/Mapping/Progress against the
  real pilot rows.

## Known gaps this branch does not fix

- An ended mapping and a live one are both visible in Mapping, but there is
  still no reassignment action — that is `admin-console-spec.md` Phase 2.
- No export, no audit trail for admin reads. Deliberate: an operator reading
  counts leaves nothing worth auditing; the break-glass path for clinical
  content is separate work.
