# Evia — Mobile App

Flutter app for the Evia platform. Built with Riverpod, Amazon Cognito phone-OTP auth, and WebSocket-based AI conversation.

## Prerequisites

- Flutter 3.x (stable) — check with `flutter doctor`
- Android emulator or physical device
- Backend API running locally (see root-level `CONTRIBUTING.md`)

## Running Locally

### 1. Start the backend

```bash
cd apps/api
pnpm dev
```

The API starts on port 8080.

### 2. Run the Flutter app

```bash
flutter run --flavor dev --dart-define=FLAVOR=dev
```

### Connecting to the backend

The dev flavor resolves the API at `lib/src/config/environment.dart`. The default URL depends on your target:

| Target | Default URL | Why |
|---|---|---|
| **Android emulator** | `http://10.0.2.2:8080` | `10.0.2.2` routes to the host machine's `localhost` |
| **iOS simulator** | `http://localhost:8080` | Simulator shares the host's network |
| **Physical device** | `http://<your-LAN-IP>:8080` | Use your PC's LAN IP (e.g. `192.168.1.2`) |

You can override the URL at build time without editing source code:

```bash
# iOS simulator
flutter run --flavor dev --dart-define=FLAVOR=dev \
  --dart-define=BASE_URL=http://localhost:8080 \
  --dart-define=WS_URL=ws://localhost:8080

# Physical device on same WiFi
flutter run --flavor dev --dart-define=FLAVOR=dev \
  --dart-define=BASE_URL=http://192.168.1.2:8080 \
  --dart-define=WS_URL=ws://192.168.1.2:8080
```

### Phone auth (Amazon Cognito)

Sign-in is phone OTP issued by an Amazon Cognito user pool, called as plain HTTPS
JSON from `lib/src/core/cognito_client.dart` over the existing `dio` dependency —
no Amplify, no AWS SDK. The pool coordinates come from `--dart-define`:

```bash
flutter run --flavor dev --dart-define=FLAVOR=dev \
  --dart-define=COGNITO_REGION=ap-south-1 \
  --dart-define=COGNITO_USER_POOL_ID=ap-south-1_XXXXXXXX \
  --dart-define=COGNITO_CLIENT_ID=<mobile app client id>
```

Without `COGNITO_CLIENT_ID` the app still runs; the login screen reports
"Sign-in is not configured on this build." Use the bypass below for local work.

Flow (`lib/src/core/auth_service.dart`):

| Step | Cognito operation |
|---|---|
| New number | `SignUp` → SMS code |
| Returning number (`UsernameExistsException`) | `ForgotPassword` → SMS code |
| Verify new number | `ConfirmSignUp` → `InitiateAuth(USER_PASSWORD_AUTH)` |
| Verify returning number | `ConfirmForgotPassword` → `InitiateAuth(USER_PASSWORD_AUTH)` |
| Expired token | `InitiateAuth(REFRESH_TOKEN_AUTH)` |
| Sign out | clear local tokens + best-effort `RevokeToken` |

The per-device password is 32 random bytes (base64url) generated on the device and
never shown to the user — the user only ever types the SMS code.

### Token storage — hardening step

Phone number, device password, refresh token and ID token are persisted with
`shared_preferences` (`lib/src/core/token_store.dart`), which is plain-text app
storage. **Moving `TokenStore` to `flutter_secure_storage`** (Keystore/Keychain
backed) is the hardening step before a store release; nothing else has to change —
`TokenStore` is the only seam.

### Bypassing phone auth (local dev)

Pass the backend's bypass token to skip phone OTP:

```bash
flutter run --flavor dev --dart-define=FLAVOR=dev \
  --dart-define=LOCAL_DEV_BYPASS_AUTH=<token>
```

The backend also needs `LOCAL_DEV_BYPASS_AUTH="true"` in the root `.env` file.

## Project Structure

```
lib/
├── main.dart                  # App entry point
├── src/
│   ├── app.dart               # MaterialApp widget
│   ├── config/                # Environment, app_config, flavor_config
│   ├── core/                  # Dio client, WebSocket service, auth providers
│   ├── features/              # Feature-specific screens and logic
│   └── widgets/               # Reusable widgets
```

## Flavors

| Flavor | Application ID | Backend URL |
|---|---|---|
| `dev` | `ai.evia.app.dev` | Localhost (configurable) |
| `beta` | `ai.evia.app.beta` | `https://beta.api.okuvu.in` — AWS ECS Fargate behind the ALB |
| `prod` | `ai.evia.app` | `https://api.okuvu.in` — AWS ECS Fargate behind the ALB |

Both hosts are Route53 aliases to the ALB in `infrastructure/aws/evia-beta/dns.tf`.
Override per build with `--dart-define=BASE_URL=… --dart-define=WS_URL=…`.
Nothing in the app points at GCP any more: auth is Amazon Cognito over HTTPS,
crashes go through `CrashReporter`, and there is no Firebase SDK or config file.

## Building APKs

Each flavor requires both `--flavor` (matches the `productFlavors` blocks in `android/app/build.gradle`) and `--dart-define=FLAVOR=<flavor>` (required by `AppConfig.init()`):

```bash
# Dev
flutter build apk --flavor dev --dart-define=FLAVOR=dev

# Beta
flutter build apk --flavor beta --dart-define=FLAVOR=beta

# Prod
flutter build apk --flavor prod --dart-define=FLAVOR=prod
```

For app bundles instead of APKs, swap `apk` → `appbundle`. Add `--debug` or `--release` to choose the build type (defaults to release).

## Building AAB (Play Console)

The Android App Bundle (`.aab`) is what you upload to the Google Play Console. It always builds in release mode and **must be signed with a release keystore** (not the debug key — Play Console rejects debug-signed bundles).

### 1. Generate the upload keystore (one-time)

```bash
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore android/upload-keystore.jks \
  -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

You'll be prompted for a keystore password, key password, and certificate details. **Back this keystore up safely** — you must use the same keystore for every future upload of the same app.

### 2. Create `android/keystore.properties`

This file is gitignored (never committed). Copy the example and fill in your passwords:

```bash
cp android/keystore.properties.example android/keystore.properties
```

```
storePassword=<your keystore password>
keyPassword=<your key password>
keyAlias=upload
storeFile=upload-keystore.jks
```

`android/app/build.gradle` reads this file and applies it to `signingConfigs.release`, which is used for all release (and AAB) builds.

### 3. Build the AAB

```bash
# Prod (recommended for Play Console release tracks)
flutter build appbundle --flavor prod --dart-define=FLAVOR=prod

# Beta (internal/closed testing track)
flutter build appbundle --flavor beta --dart-define=FLAVOR=beta

# Dev (internal distribution only)
flutter build appbundle --flavor dev --dart-define=FLAVOR=dev
```

The output bundle is written to:

```
build/app/outputs/bundle/<flavor>Release/app-<flavor>-release.aab
```

Example for prod: `build/app/outputs/bundle/prodRelease/app-prod-release.aab`.

### 4. Verify the signing

```bash
jarsigner -verify -verbose -certs \
  build/app/outputs/bundle/prodRelease/app-prod-release.aab
```

Confirm the certificate is your upload cert (CN=Evia), **not** `Android Debug`.

> **Play App Signing:** For production releases, enroll in [Play App Signing](https://developer.android.com/studio/publish/app-signing). Google keeps the app-signing key; you keep and upload with the `upload` keystore generated above. Use the **same** keystore for every upload of that app.
