/**
 * TH-S39 — outbound mail for the transcript emails.
 *
 * Sends from the org's own Gmail mailbox (admin@okuvu.in) through the Composio
 * Gmail toolkit, which is already connected for this account. Deliberately not
 * SMTP and not a new provider: the mailbox has no app password, and the
 * Composio connection is the one credential that already exists.
 *
 * Transport is the Composio MCP endpoint (JSON-RPC over HTTP, SSE-framed
 * replies). The access token is short-lived (~1h), so the refresh token is the
 * durable credential: a call that comes back unauthorized refreshes once and
 * retries. Everything the caller needs is in env, so the harness never stores
 * a token on disk:
 *
 *   COMPOSIO_CLIENT_ID       OAuth client id of the connection (not a secret)
 *   COMPOSIO_REFRESH_TOKEN   offline_access refresh token  ← the real secret
 *   COMPOSIO_MCP_URL         default https://connect.composio.dev/mcp
 *   COMPOSIO_TOKEN_URL       default https://login.composio.dev/oauth2/token
 *   COMPOSIO_GMAIL_ACCOUNT   connected account id (default gmail_stark-hapuku)
 *   TRANSCRIPT_EMAIL_FROM    default admin@okuvu.in
 *
 * A missing refresh token is not an error at import time — the caller reports
 * "email not configured" against the specific conversation, so a run still
 * produces its transcripts and only the delivery is marked failed.
 */

const DEFAULT_MCP_URL = 'https://connect.composio.dev/mcp';
const DEFAULT_TOKEN_URL = 'https://login.composio.dev/oauth2/token';
const DEFAULT_ACCOUNT = 'gmail_stark-hapuku';

interface TokenCache {
  accessToken: string | null;
  expiresAt: number;
}

const tokenCache: TokenCache = { accessToken: null, expiresAt: 0 };

export interface MailerConfig {
  mcpUrl: string;
  tokenUrl: string;
  clientId: string;
  refreshToken: string;
  account: string;
  fromEmail: string;
}

export function mailerConfig(env: NodeJS.ProcessEnv = process.env): MailerConfig | null {
  const clientId = env.COMPOSIO_CLIENT_ID?.trim();
  const refreshToken = env.COMPOSIO_REFRESH_TOKEN?.trim();
  if (!clientId || !refreshToken) return null;
  return {
    mcpUrl: env.COMPOSIO_MCP_URL?.trim() || DEFAULT_MCP_URL,
    tokenUrl: env.COMPOSIO_TOKEN_URL?.trim() || DEFAULT_TOKEN_URL,
    clientId,
    refreshToken,
    account: env.COMPOSIO_GMAIL_ACCOUNT?.trim() || DEFAULT_ACCOUNT,
    fromEmail: env.TRANSCRIPT_EMAIL_FROM?.trim() || 'admin@okuvu.in',
  };
}

/** Exchange the refresh token for an access token. Cached until ~2 min before expiry. */
async function accessToken(config: MailerConfig, force = false): Promise<string> {
  if (!force && tokenCache.accessToken && tokenCache.expiresAt - 120_000 > Date.now()) {
    return tokenCache.accessToken;
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: config.refreshToken,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Composio token refresh failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('Composio token refresh returned no access_token');

  tokenCache.accessToken = body.access_token;
  tokenCache.expiresAt = Date.now() + (body.expires_in ?? 3600) * 1000;
  return body.access_token;
}

/** Pull the JSON-RPC reply out of an SSE-framed MCP response body. */
function parseMcpBody(raw: string, contentType: string, requestId: number): unknown {
  if (!contentType.includes('text/event-stream')) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`Unreadable MCP response: ${raw.slice(0, 300)}`);
    }
  }

  let found: unknown = null;
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      const message = JSON.parse(line.slice(6)) as { id?: number };
      if (message.id === requestId) found = message;
    } catch {
      // heartbeat / partial frame — keep scanning
    }
  }
  if (!found) throw new Error(`MCP returned no matching reply: ${raw.slice(0, 300)}`);
  return found;
}

async function mcpCall(config: MailerConfig, payload: Record<string, unknown>, retry = true): Promise<unknown> {
  const token = await accessToken(config);
  const requestId = payload.id as number;

  const response = await fetch(config.mcpUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(payload),
  });

  if ((response.status === 401 || response.status === 403) && retry) {
    await accessToken(config, true);
    return mcpCall(config, payload, false);
  }

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Composio MCP HTTP ${response.status}: ${raw.slice(0, 300)}`);
  }
  return parseMcpBody(raw, response.headers.get('content-type') ?? '', requestId);
}

export interface SendResult {
  messageId: string;
}

/**
 * Send one plain-text email from the connected mailbox.
 *
 * The account id is always passed explicitly: two Gmail accounts are connected
 * to this Composio org (admin@okuvu.in as `okuvu`, a personal one as `suvok`),
 * and letting the toolkit pick a default is how a clinician's transcript gets
 * mailed from the wrong identity.
 */
export async function sendPlainEmail(
  input: { to: string; subject: string; body: string },
  config: MailerConfig | null = mailerConfig(),
): Promise<SendResult> {
  if (!config) {
    throw new Error(
      'Email is not configured — COMPOSIO_CLIENT_ID / COMPOSIO_REFRESH_TOKEN are unset in this environment.',
    );
  }

  const reply = (await mcpCall(config, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'COMPOSIO_MULTI_EXECUTE_TOOL',
      arguments: {
        tools: [
          {
            tool_slug: 'GMAIL_SEND_EMAIL',
            account: config.account,
            arguments: {
              recipient_email: input.to,
              subject: input.subject,
              body: input.body,
              is_html: false,
              // The mailbox signature is a therapist-facing artifact; a
              // transcript for clinical review should end with the transcript.
              include_signature: false,
              from_email: config.fromEmail,
            },
          },
        ],
        sync_response_to_workbench: false,
        thought: 'send an Okuvu chat transcript for clinical review',
      },
    },
  })) as {
    result?: { content?: { text?: string }[]; isError?: boolean };
    error?: { message?: string };
  };

  if (reply.error) throw new Error(reply.error.message ?? 'Composio MCP error');

  const text = reply.result?.content?.[0]?.text;
  if (!text) throw new Error('Composio returned no content for GMAIL_SEND_EMAIL');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Composio reply was not JSON: ${text.slice(0, 300)}`);
  }

  const data = parsed as {
    successful?: boolean;
    error?: string | null;
    data?: { results?: { response?: { successful?: boolean; data?: { id?: string }; error?: string } }[] };
  };

  const inner = data.data?.results?.[0]?.response;
  if (data.successful === false || data.error) {
    throw new Error(`Gmail send failed: ${data.error ?? 'unknown error'}`);
  }
  if (inner && inner.successful === false) {
    throw new Error(`Gmail send failed: ${inner.error ?? 'unknown error'}`);
  }

  const messageId = inner?.data?.id;
  if (!messageId) throw new Error(`Gmail send returned no message id: ${text.slice(0, 300)}`);
  return { messageId };
}
