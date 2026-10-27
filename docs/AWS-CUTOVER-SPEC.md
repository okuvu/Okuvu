# AWS Cutover Spec — removing every GCP/Firebase dependency

Status: authoritative for the GCP→AWS code cutover. Written 27 Oct 2026.
Supersedes the provider-seam "Track A" defaults (which kept GCP as the default).

## Hard rule

No runtime path in `apps/*` or `infrastructure/*` may import, call, or require a
Google/Firebase/GCP package, endpoint, credential or env var. After this cutover
`grep -riE "firebase|gcp|google-cloud|googleapis|gcloud|vertex|cloud ?tasks"` over
source must return nothing except (a) historical prisma migrations, (b) docs that
describe the cutover itself.

Removal targets, by category:

| GCP thing | AWS replacement | Where |
|---|---|---|
| Firebase Auth (client phone OTP) | Amazon Cognito user pool, phone_number alias, SMS via Cognito | mobile, api token verify |
| Firebase Auth (therapist Google login) | Amazon Cognito user pool + NextAuth `CognitoProvider` | therapist-portal |
| firebase-admin token verify | Cognito JWT verify (JWKS, RS256) | api |
| Vertex AI Gemini (LLM) | Amazon Bedrock (`amazon.nova-pro-v1:0`) — module already exists | api, worker, harness |
| Vertex AI text-embedding-004 | Bedrock Titan Text Embeddings V2 (768-dim) — exists | api, worker |
| Cloud Tasks (summary queue) | Amazon SQS — `sqs-enqueue.ts` already exists | api |
| Google Secret Manager | AWS Secrets Manager — branch already exists | api |
| Cloud Run OIDC (`google-auth-library`) | internal ALB / SigV4 — drop the verifier | worker |
| Firebase Analytics | no-op local logger + optional `/telemetry` POST | mobile |
| Firebase Crashlytics | `CrashReporter` seam, local log + optional POST | mobile |
| google-services.json / Google Services Gradle plugin | deleted; no replacement needed | mobile |
| `@google-cloud/*`, `firebase*` npm deps | removed from package.json | all |
| `firebase_core/auth/analytics/crashlytics` pub deps | removed | mobile |
| infrastructure/gcp/*, cloudbuild.yaml | infrastructure/aws/*, buildspec.yml (CodeBuild) | infra |
| `firebase_uid` DB column | `auth_subject` (already renamed in schema + migration) | prisma |

## Decisions already made (do not re-litigate)

1. **Clients use Cognito directly.** The API does not issue tokens for clients and
   gains no new OTP endpoints. Keeps the API change to token *verification* only.
2. **Therapist portal uses Cognito as the NextAuth provider**, not Google OAuth.
   Google federation inside Cognito is optional and off — an OAuth client id is a
   GCP resource, so keeping Google login would keep a GCP dependency.
3. **No Amplify, no AWS SDK on the Flutter side.** Cognito is called as plain
   HTTPS form posts through the existing `dio` dependency.
4. **Access tokens are verified offline against the pool JWKS**, cached in memory,
   using `node:crypto` — no new npm dependency, no network call per request.
5. **Seams collapse to one implementation.** The `OKUVU_LLM_PROVIDER`,
   `OKUVU_QUEUE_PROVIDER`, `OKUVU_SECRETS_PROVIDER` switches and their GCP
   branches are deleted, not kept as fallbacks. Rollback is a redeploy, not an
   env flip.

## Naming and env contract (authoritative)

```
AWS_REGION                       ap-south-1
BEDROCK_MODEL_ID                 amazon.nova-pro-v1:0
BEDROCK_EMBEDDING_MODEL_ID       amazon.titan-embed-text-v2:0
SQS_SUMMARY_QUEUE_URL            https://sqs.ap-south-1.amazonaws.com/.../summary-jobs
SQS_SUMMARY_DLQ_URL              ...
COGNITO_REGION                   ap-south-1        (falls back to AWS_REGION)
COGNITO_USER_POOL_ID             ap-south-1_XXXXXXXX
COGNITO_CLIENT_ID                mobile app client id
COGNITO_THERAPIST_POOL_ID        therapist pool id
COGNITO_THERAPIST_CLIENT_ID      therapist app client id
COGNITO_THERAPIST_CLIENT_SECRET  therapist app client secret
COGNITO_ISSUER                   https://cognito-idp.<region>.amazonaws.com/<pool>
```

Deleted env vars (must not appear in any `.env.example` or doc):
`FIREBASE_*`, `GOOGLE_APPLICATION_CREDENTIALS*`, `VERTEX_AI_*`, `GEMINI_PRO_MODEL`,
`CLOUD_TASKS_*`, `WORKER_SERVICE_ACCOUNT_EMAIL`, `OKUVU_*_PROVIDER`.

## Token verification contract (api)

`apps/api/src/lib/cognito-auth.ts`

```ts
export async function verifyCognitoToken(token: string): Promise<{ uid: string }>
```

- RS256 only. `kid` looked up in `https://cognito-idp.${region}.amazonaws.com/${poolId}/.well-known/jwks.json`
  (fetch once, cache 1h, refetch once on unknown kid).
- Reject when: signature invalid, `iss !== COGNITO_ISSUER`, `exp` in past,
  `token_use` not in `id|access`, and for `id` tokens `aud !== COGNITO_CLIENT_ID`,
  for `access` tokens `client_id !== COGNITO_CLIENT_ID`.
- Returns the `sub` claim as `uid` (the value stored in `User.auth_subject`).
- Throws `CognitoTokenError` on any failure; the middleware maps it to 401.

`middleware/auth.ts` keeps its bypass and load-test branches untouched but exports
`verifyAuthJWT` and calls `verifyCognitoToken`.

## Mobile auth contract (dio → Cognito, form-encoded)

Cognito endpoint: `POST https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`
header `X-Amz-Target: AWSCognitoIdentityProviderService.<Op>`,
`Content-Type: application/x-amz-json-1.1`, body JSON.

Ops used, in this order:

1. `SignUp` `{ClientId, Username: <e164>, Password, UserAttributes:[{Name:"phone_number",Value:<e164>}]}`
   - `UsernameExistsException` → step 2 (returning user), everything else is fatal.
   - success → Cognito sends the SMS confirmation code.
2. `ForgotPassword` `{ClientId, Username}` — also sends an SMS code.
3. `VerifyOtp` maps to:
   - signup flow → `ConfirmSignUp` `{ClientId, Username, ConfirmationCode}`
   - reset flow  → `ConfirmForgotPassword` `{ClientId, Username, ConfirmationCode, Password}`
   then `InitiateAuth` `{AuthFlow:"USER_PASSWORD_AUTH", ClientId, AuthParameters:{USERNAME, PASSWORD}}`
4. `getIdToken` → `InitiateAuth` `{AuthFlow:"REFRESH_TOKEN_AUTH", ClientId, AuthParameters:{REFRESH_TOKEN}}`
5. `SignOut` → clear local tokens (`RevokeToken` best-effort).

`verificationId` is an opaque base64url JSON `{flow, phone, password}` so the
existing screen signature `verifyOtp(verificationId, smsCode)` is unchanged.

The device password is 32 random bytes (base64url), never shown to the user, kept
in `shared_preferences` alongside phone + refresh token. Document in the app's
README that moving this to `flutter_secure_storage` is the hardening step.

Public surface of `AuthService` must stay: `currentUser`, `getIdToken()`,
`verifyPhone({phoneNumber, onCodeSent, onError, forceResendingToken})`,
`verifyOtp({verificationId, smsCode})`, `signOut()`, `authStateChanges()`.
`AuthUser` = `{uid, phoneNumber}`. Error type `AuthException {code, message}`
replaces `FirebaseAuthException`; keep the human-readable `message` mapping
(`CodeMismatchException` → "That code is incorrect.", `ExpiredCodeException` →
"That code has expired. Request a new one.", `LimitExceededException` →
"Too many attempts. Try again in a few minutes.", `NotAuthorizedException` →
"Sign-in failed. Request a new code.").

## Working rules for every workstream

- Do not edit `packages/prisma/**`, `pnpm-lock.yaml`, root `package.json`, or
  another app's directory. The column rename is already applied.
- Do not run `pnpm install` (lockfile churn is batched by the parent). Edit
  `package.json` deps and rely on the existing `node_modules` for verification.
- Verification per app: `npx vitest run` (or `flutter analyze` + `flutter test`),
  plus `npx tsc --noEmit`. Green means green: no skipped tests, no `.only`.
- Delete GCP tests rather than letting them rot; every deleted test must be
  replaced by an AWS-path test asserting the same behaviour class, or the reason
  for dropping it stated in the commit message.
- Prefer editing imports over rewriting behaviour. Behaviour changes only where
  the transport changes.
- Never leave a `TODO` about GCP.
