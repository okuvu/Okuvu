import { CloudTasksClient } from '@google-cloud/tasks';
import { enqueueSummaryJob as enqueueSummaryJobOnSqs, validateSqsConfig } from './sqs-enqueue.js';
import { resolveQueueProvider } from './provider-config.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

let _client: CloudTasksClient | undefined;

function getClient(): CloudTasksClient {
  if (!_client) {
    _client = new CloudTasksClient();
  }
  return _client;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function validateCloudTasksConfig(): string[] {
  const required = [
    ['CLOUD_TASKS_PROJECT_ID', process.env.CLOUD_TASKS_PROJECT_ID],
    ['CLOUD_TASKS_QUEUE', process.env.CLOUD_TASKS_QUEUE],
    ['CLOUD_TASKS_LOCATION', process.env.CLOUD_TASKS_LOCATION],
    ['CLOUD_TASKS_WORKER_URL', process.env.CLOUD_TASKS_WORKER_URL],
    ['WORKER_SERVICE_ACCOUNT_EMAIL', process.env.WORKER_SERVICE_ACCOUNT_EMAIL],
  ] as const;

  return required
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

function getEnvConfig(): { project: string; queue: string; location: string; workerUrl: string; saEmail: string } | null {
  const project = process.env.CLOUD_TASKS_PROJECT_ID;
  const queue = process.env.CLOUD_TASKS_QUEUE;
  const location = process.env.CLOUD_TASKS_LOCATION;
  const workerUrl = process.env.CLOUD_TASKS_WORKER_URL;
  const saEmail = process.env.WORKER_SERVICE_ACCOUNT_EMAIL;

  if (!project || !queue || !location || !workerUrl || !saEmail) {
    return null;
  }
  return { project, queue, location, workerUrl, saEmail };
}

export async function enqueueSummaryJob(
  sessionId: string,
  userId: string,
  log?: { info: (obj: Record<string, unknown>, msg: string) => void; warn: (obj: Record<string, unknown>, msg: string) => void; error: (obj: Record<string, unknown>, msg: string) => void },
): Promise<void> {
  // Provider seam (see provider-config.ts): the queue transport is chosen in
  // exactly one place. `cloudtasks` is the default, so this function's own
  // body below is the pre-migration code path untouched; `sqs` delegates to
  // the SQS producer with the identical contract. Callers (session-close.ts,
  // app.ts) never learn which transport is live.
  if (resolveQueueProvider() === 'sqs') {
    return enqueueSummaryJobOnSqs(sessionId, userId, log);
  }

  const isDev = process.env.NODE_ENV === 'development';
  const workerUrl = process.env.CLOUD_TASKS_WORKER_URL;

  if (isDev && workerUrl) {
    const url = `${workerUrl.replace(/\/$/, '')}/tasks/summary`;
    if (log) {
      log.info({ event: 'summary_enqueue_local', session_id: sessionId, user_id: userId, url }, 'Calling worker directly (local dev bypass)');
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, user_id: userId }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Worker returned ${res.status}: ${text}`);
    }
    if (log) {
      log.info({ event: 'summary_enqueue_local', session_id: sessionId, user_id: userId, outcome: 'completed' }, 'Worker called directly');
    }
    return;
  }

  const env = getEnvConfig();
  if (!env) {
    const missing = validateCloudTasksConfig();
    if (log) {
      log.warn({ event: 'summary_enqueue', session_id: sessionId, user_id: userId, missing_vars: missing }, 'Cloud Tasks not configured — skipping enqueue');
    }
    return;
  }

  const client = getClient();
  const parent = client.queuePath(env.project, env.location, env.queue);

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: `${env.workerUrl}/tasks/summary`,
      oidcToken: {
        serviceAccountEmail: env.saEmail,
        audience: env.workerUrl,
      },
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify({ session_id: sessionId, user_id: userId })).toString('base64'),
    },
  };

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const [response] = await client.createTask({ parent, task });
      if (log) {
        log.info({ event: 'summary_enqueue', session_id: sessionId, user_id: userId, task_name: response.name, outcome: 'enqueued', attempt }, 'Summary task enqueued');
      }
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (log) {
        log.warn({ event: 'summary_enqueue', session_id: sessionId, user_id: userId, err: lastError.message, attempt, max_retries: MAX_RETRIES }, 'Summary enqueue attempt failed');
      }
      if (attempt < MAX_RETRIES) {
        const backoffMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await delay(backoffMs);
      }
    }
  }

  if (log && lastError) {
    log.error({ event: 'summary_enqueue', session_id: sessionId, user_id: userId, err: lastError.message, outcome: 'failed_all_retries', max_retries: MAX_RETRIES }, 'Summary enqueue failed after all retries');
  }
  throw lastError ?? new Error('Summary enqueue failed after all retries');
}
