# Evia — Mobile App

Flutter app for the Evia platform. Built with Riverpod, Firebase Auth, and WebSocket-based AI conversation.

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

### Bypassing Firebase Auth (local dev)

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
| `beta` | `ai.evia.app.beta` | GCP Cloud Run (staging) |
| `prod` | `ai.evia.app` | GCP Cloud Run (production) |

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
