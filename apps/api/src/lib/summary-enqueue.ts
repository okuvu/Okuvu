import { CloudTasksClient } from '@google-cloud/tasks';

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
