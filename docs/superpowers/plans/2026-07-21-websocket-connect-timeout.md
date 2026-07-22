# WebSocket Connect Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 10-second timeout to `WebSocketService.connect()` so a silently-dropped TCP handshake transitions to error state and triggers reconnect instead of hanging indefinitely.

**Architecture:** A `Timer` is started after `IOWebSocketChannel.connect()` succeeds. It is cancelled if `session_open_confirmed` arrives or `_onError` fires naturally. If the timer fires before either, it forces `WsConnectionState.error` with `errorType: 'connect_timeout'` and calls `_startReconnect()`.

**Tech Stack:** Flutter/Dart, `dart:async` Timer, `web_socket_channel` package

## Global Constraints

- No `LOCAL_DEV_BYPASS_AUTH` changes
- Match existing code style (no comments, use named parameters)
- State transitions must keep existing reconnect banner logic intact

---

### Task 1: Add connect timeout to WebSocketService

**Files:**
- Modify: `apps/mobile/lib/src/core/websocket_service.dart`

**Interfaces:**
- Consumes: `WsConnectionState`, `_setState()`, `_startReconnect()`, existing stream listeners
- Produces: `_connectTimeoutTimer` field, timeout handling in `connect()`, timer cancellation in `_onMessage`/`_onError`/`disconnect`/`dispose`

- [ ] **Step 1: Add `_connectTimeoutTimer` field to `WebSocketService`**

Add after line 31 (`Timer? _reconnectTimer;`):
```dart
Timer? _connectTimeoutTimer;
```

- [ ] **Step 2: Start the timeout timer in `connect()`**

In the `try` block after the stream listener is set up (line 100) and before `_setState(WsConnectionState.connected)`:
```dart
      _connectTimeoutTimer?.cancel();
      _connectTimeoutTimer = Timer(const Duration(seconds: 10), () {
        if (_state == WsConnectionState.connecting ||
            _state == WsConnectionState.connected) {
          if (kDebugMode) {
            debugPrint('[WebSocketService] Connect timeout — forcing error state');
          }
          _setState(WsConnectionState.error, errorType: 'connect_timeout');
          _startReconnect();
        }
      });
```

- [ ] **Step 3: Cancel timeout when session becomes active**

In `_onMessage`, inside the `session_open_confirmed` case, add before line 121:
```dart
          _connectTimeoutTimer?.cancel();
```

- [ ] **Step 4: Cancel timeout on stream error**

In `_onError`, add before the existing lines:
```dart
    _connectTimeoutTimer?.cancel();
```

- [ ] **Step 5: Cancel and nullify timeout in `disconnect()`**

In `disconnect()`, add after line 271 (`_cancelReconnect();`):
```dart
    _connectTimeoutTimer?.cancel();
    _connectTimeoutTimer = null;
```

- [ ] **Step 6: Cancel and nullify timeout in `_cancelReconnect()`**

In `_cancelReconnect()`, add after line 225 (`_reconnectTimer?.cancel();`):
```dart
    _connectTimeoutTimer?.cancel();
    _connectTimeoutTimer = null;
```

- [ ] **Step 7: Cleanup timeout in `dispose()`**

In `dispose()`, add before line 287 (`disconnect();`):
```dart
    _connectTimeoutTimer?.cancel();
```

- [ ] **Step 8: Verify build**

Run: `cd apps/mobile && flutter analyze`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/lib/src/core/websocket_service.dart
git commit -m "fix(mobile): add 10s timeout to WebSocket connect to prevent indefinite hang"
```
