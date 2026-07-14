# ADR-002: WebSocket Authentication via Authorization Header

**Status:** Accepted
**Date:** 2026-07-13
**Driver:** ISSUE-P6 — WebSocket auth token passed as query param

## Context

The WebSocket client was passing Firebase auth tokens as URL query parameters (`wss://api.evia.ai/ws?token=...`). This exposed tokens in GCP load balancer logs, server access logs, and potentially browser history/referer headers. Additionally, the server-side `verifyFirebaseJWT` middleware reads from the `Authorization` header, not query params — meaning auth was effectively broken outside local dev (where `LOCAL_DEV_BYPASS_AUTH=true` bypasses validation entirely).

## Decision

Use the standard `Authorization: Bearer <token>` header for WebSocket authentication, matching the pattern used by all REST API endpoints.

## Alternatives Considered

### Sec-WebSocket-Protocol header
- Token would be in HTTP upgrade headers rather than URL
- Requires server-side changes to read from a non-standard location
- This header is intended for sub-protocol negotiation (RFC 6455), not authentication
- Some proxies may strip or modify hop-by-hop headers

### First-message AUTH frame
- Token never appears in any HTTP-level artifact
- Two round-trips before session can start (connect → AUTH → session_open)
- Requires an authenticated/unauthenticated state machine on the server
- Adds complexity for minimal security benefit over the chosen approach

## Consequences

- Zero server-side changes required (existing `verifyFirebaseJWT` middleware works as-is)
- WebSocket auth is now consistent with REST API auth
- Tokens no longer appear in GCP Cloud Logging URL captures
- The `@fastify/websocket` preHandler ensures auth validation before any WebSocket frames are exchanged
