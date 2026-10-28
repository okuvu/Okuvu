# Therapist Portal — sign-in setup and "unauthorized" troubleshooting

> **⚠️ SUPERSEDES the old Google-OAuth instructions.** The portal no longer uses
> Google OAuth, and there is no `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to
> create. Therapists sign in through **Amazon Cognito** (email + password, with
> optional TOTP MFA), federated into NextAuth by `CognitoProvider`.

---

## What the portal needs to run

| Variable | Where it comes from |
|---|---|
| `COGNITO_THERAPIST_CLIENT_ID` | `terraform output cognito_therapist_app_client_id` |
| `COGNITO_THERAPIST_CLIENT_SECRET` | `terraform output -raw cognito_therapist_client_secret` |
| `COGNITO_ISSUER` | `terraform output cognito_issuer` |
| `COGNITO_THERAPIST_POOL_ID` | `terraform output cognito_therapist_pool_id` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3001` locally, the deployed origin otherwise |
| `DATABASE_URL` | RDS connection string (see `.env.example`) |

The app client's callback URL must be
`${NEXTAUTH_URL}/api/auth/callback/cognito` — the Terraform variable
`portal_callback_urls` registers this, and a mismatch is the single most common
cause of a sign-in loop.

Partially configured Cognito variables produce an **empty provider list**, which
NextAuth reports as a configuration error rather than silently letting anyone
in. `apps/therapist-portal/src/__tests__/auth.test.ts` pins that behaviour.

---

## Provisioning a therapist

The portal authorises by looking the signed-in email up in the `therapist`
table — Cognito proves *who* someone is, the database decides whether they are
allowed in. Both steps are required:

1. **Create the Cognito user** (console or CLI):

   ```bash
   aws cognito-idp admin-create-user \
     --user-pool-id "$COGNITO_THERAPIST_POOL_ID" \
     --username therapist@example.com \
     --user-attributes Name=email,Value=therapist@example.com Name=email_verified,Value=true \
     --desired-delivery-mediums EMAIL
   ```

   The invited user gets a temporary password by email and is forced to change
   it on first sign-in.

2. **Add the row to the therapist table** (Prisma), e.g.
   `apps/therapist-portal/src/scripts/seed-therapist.ts`.

Miss step 2 and you get `?error=unauthorized`. Miss step 1 and Cognito rejects
the password before the portal is ever consulted.

---

## The three error states you will actually see

| What you see | Cause | Fix |
|---|---|---|
| `?error=unauthorized` | Cognito sign-in succeeded; the email is not in the `therapist` table | Run the seed script for that email |
| `?error=server_error` | The `signIn` callback could not reach the database | Check `DATABASE_URL` and that the RDS security group allows the portal |
| `?error=Configuration` | Missing/partial `COGNITO_*` config | Fill in all four variables; restart the dev server |
| Sign-in loops back to `/auth` | Callback URL mismatch | Register `${NEXTAUTH_URL}/api/auth/callback/cognito` on the app client |

---

## Local development without Cognito

`LOCAL_DEV_BYPASS_AUTH=true` short-circuits both the middleware and the
`auth()` helper with a mock session. The portal's boot guard refuses to start
with this flag set when `NODE_ENV=production`, so it cannot reach a deployed
environment.
