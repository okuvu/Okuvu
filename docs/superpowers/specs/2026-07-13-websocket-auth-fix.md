# WebSocket Auth Fix — ISSUE-P6

**Date:** 2026-07-13
**Story:** ISSUE-P6
**Severity:** HIGH — security concern + functional breakage in beta/prod

## Problem

`websocket_service.dart:86` passes the auth token as a URL query parameter:

```
wss://api.evia.ai/ws?token=eyJhbGci...
```

This causes two issues:

1. **Security:** Tokens in URLs are logged by proxy servers, load balancers (GCP Cloud Logging captures full URLs), server access logs, browser history, and Referer headers — a concern for a clinical health app.

2. **Functional:** The server middleware (`auth.ts`) reads auth from `request.headers.authorization`, but the client sends it in the query string. The only reason it works in dev is `LOCAL_DEV_BYPASS_AUTH=true`. In beta/prod, the WebSocket upgrade fails with 401.

## Decision

Move the token from the URL query parameter to the `Authorization: Bearer` header — the same authentication mechanism used by all other API requests.

**Chosen approach: Option C (Authorization header)**

Rejected alternatives:
- **Option A (`Sec-WebSocket-Protocol` header):** Would require server-side changes to read from a non-standard header. The `Sec-WebSocket-Protocol` is intended for sub-protocol negotiation, not auth.
- **Option B (first-message AUTH frame):** Two round-trips before session can start, requires new auth state machine on the server. More complex for no additional security benefit over the header approach.

## Client Changes

### `apps/mobile/lib/src/core/websocket_service.dart`

**Line 86:** Replace URL query-param with `Authorization` header.

Before:
```dart
final uri = Uri.parse('$wsBaseUrl${WsConstants.sessionPath}?token=$token');
_channel = WebSocketChannel.connect(uri);
```

After:
```dart
final uri = Uri.parse('$wsBaseUrl${WsConstants.sessionPath}');
_channel = WebSocketChannel.connect(
  uri,
  headers: {'Authorization': 'Bearer $token'},
);
```

### `apps/mobile/lib/src/features/chat/chat_screen.dart`

**Line 31-34:** Resolve the correct token based on environment.

Before:
```dart
ref.read(webSocketServiceProvider).connect(
  wsBaseUrl: AppConfig.wsBaseUrl,
  token: FlavorConfig.devBypassToken ?? '',
);
```

After:
```dart
final token = AppConfig.flavor == 'dev'
    ? (FlavorConfig.devBypassToken ?? '')
    : (await ref.read(authServiceProvider).getIdToken()) ?? '';
ref.read(webSocketServiceProvider).connect(
  wsBaseUrl: AppConfig.wsBaseUrl,
  token: token,
);
```

## Server Changes

None. The existing `verifyFirebaseJWT` middleware (`auth.ts:22`) already reads from `request.headers.authorization` and strips the `Bearer ` prefix. The `@fastify/websocket` plugin runs `preHandler` middleware before the WebSocket upgrade, so auth validation happens before any frames are exchanged.

## Acceptance Criteria

- [ ] Firebase token not present in WebSocket connection URL
- [ ] Token sent via `Authorization: Bearer` header
- [ ] Server validates token via existing `verifyFirebaseJWT` middleware
- [ ] Dev bypass (`LOCAL_DEV_BYPASS_AUTH=true`) still works
- [ ] GCP Load Balancer logs verified to not contain auth tokens
- [ ] Decision documented in `docs/adr/002-websocket-auth.md`
