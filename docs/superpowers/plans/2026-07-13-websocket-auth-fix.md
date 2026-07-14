# WebSocket Auth Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move WebSocket auth token from URL query parameter to `Authorization: Bearer` header.

**Architecture:** Client-side fix only — `WebSocketChannel.connect()` supports a `headers` parameter. The existing `verifyFirebaseJWT` server middleware reads from `request.headers.authorization`, so no server changes are needed. Token source in `chat_screen.dart` is updated to use Firebase `getIdToken()` for non-dev flavors.

**Tech Stack:** Flutter/Dart (mobile), `web_socket_channel` package, `firebase_auth` package

## Global Constraints

- `LOCAL_DEV_BYPASS_AUTH=true` continues to work in dev
- No server-side code changes
- `dart:io`'s `WebSocket.connect()` supports custom headers; verify `WebSocketChannel.connect()` does too, fall back to `WebSocket.connect()` if not

---

### Task 1: Update `websocket_service.dart` to use Authorization header

**Files:**
- Modify: `apps/mobile/lib/src/core/websocket_service.dart:86`

**Interfaces:**
- Consumes: `WebSocketChannel.connect()` from `web_socket_channel` package
- Produces: WebSocket connection with `Authorization: Bearer` header instead of URL query param

- [ ] **Step 1: Replace query-param token with Authorization header**

Change line 86 from:
```dart
final uri = Uri.parse('$wsBaseUrl${WsConstants.sessionPath}?token=$token');
_channel = WebSocketChannel.connect(uri);
```

to:
```dart
final uri = Uri.parse('$wsBaseUrl${WsConstants.sessionPath}');
_channel = WebSocketChannel.connect(
  uri,
  headers: {'Authorization': 'Bearer $token'},
);
```

If `WebSocketChannel.connect()` does not support `headers` parameter, fall back to:
```dart
import 'dart:io' as io;

final uri = Uri.parse('$wsBaseUrl${WsConstants.sessionPath}');
final ws = await io.WebSocket.connect(
  uri.toString(),
  headers: {'Authorization': 'Bearer $token'},
);
_channel = WebSocketChannel(ws);
```

### Task 2: Update `chat_screen.dart` to pass real Firebase token

**Files:**
- Modify: `apps/mobile/lib/src/features/chat/chat_screen.dart:29-36`

**Interfaces:**
- Consumes: `authServiceProvider` from `providers.dart`, `FlavorConfig.devBypassToken`
- Produces: Correct token passed to `WebSocketService.connect()` for both dev and prod

- [ ] **Step 1: Update token resolution in initState**

Change lines 29-36 from:
```dart
@override
void initState() {
  super.initState();
  ref.read(webSocketServiceProvider).connect(
    wsBaseUrl: AppConfig.wsBaseUrl,
    token: FlavorConfig.devBypassToken ?? '',
  );
}
```

to:
```dart
@override
void initState() {
  super.initState();
  _connectWebSocket();
}

Future<void> _connectWebSocket() async {
  final token = AppConfig.flavor == 'dev'
      ? FlavorConfig.devBypassToken
      : await ref.read(authServiceProvider).getIdToken();
  ref.read(webSocketServiceProvider).connect(
    wsBaseUrl: AppConfig.wsBaseUrl,
    token: token ?? '',
  );
}
```

### Task 3: Verify compilation

- [ ] **Step 1: Run Dart analysis on the mobile app**

```bash
cd apps/mobile && flutter analyze
```

Expected output: No errors, warnings are pre-existing only.

### Task 4: Commit

- [ ] **Step 1: Commit the changes**

```bash
git add apps/mobile/lib/src/core/websocket_service.dart apps/mobile/lib/src/features/chat/chat_screen.dart docs/superpowers/specs/2026-07-13-websocket-auth-fix.md docs/adr/002-websocket-auth.md docs/superpowers/plans/2026-07-13-websocket-auth-fix.md
git commit -m "fix(ISSUE-P6): move WebSocket auth token from URL query to Authorization header"
```
