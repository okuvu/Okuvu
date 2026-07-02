import { CloudTasksClient } from '@google-cloud/tasks';

let _client: CloudTasksClient | undefined;

function getClient(): CloudTasksClient {
  if (!_client) {
    _client = new CloudTasksClient();
  }
  return _client;
}

export async function enqueueSummaryJob(
  sessionId: string,
  userId: string,
  log?: { info: (obj: Record<string, unknown>, msg: string) => void; warn: (obj: Record<string, unknown>, msg: string) => void; error: (obj: Record<string, unknown>, msg: string) => void },
): Promise<void> {
  const project = process.env.CLOUD_TASKS_PROJECT_ID;
  const queue = process.env.CLOUD_TASKS_QUEUE;
  const location = process.env.CLOUD_TASKS_LOCATION;
  const workerUrl = process.env.CLOUD_TASKS_WORKER_URL;
  const saEmail = process.env.WORKER_SERVICE_ACCOUNT_EMAIL;

  if (!project || !queue || !location || !workerUrl || !saEmail) {
    if (log) {
      log.warn({ event: 'summary_enqueue', session_id: sessionId, user_id: userId, missing_vars: { project: !project, queue: !queue, location: !location, workerUrl: !workerUrl, saEmail: !saEmail } }, 'Cloud Tasks not configured — skipping enqueue');
    }
    return;
  }

  const client = getClient();
  const parent = client.queuePath(project, location, queue);

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: `${workerUrl}/tasks/summary`,
      oidcToken: {
        serviceAccountEmail: saEmail,
        audience: workerUrl,
      },
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify({ session_id: sessionId, user_id: userId })).toString('base64'),
    },
  };

  try {
    const [response] = await client.createTask({ parent, task });
    if (log) {
      log.info({ event: 'summary_enqueue', session_id: sessionId, user_id: userId, task_name: response.name, outcome: 'enqueued' }, 'Summary task enqueued');
    }
  } catch (err) {
    if (log) {
      log.error({ event: 'summary_enqueue', session_id: sessionId, user_id: userId, err, outcome: 'failed' }, 'Failed to enqueue summary task');
    }
    throw err;
  }
}
