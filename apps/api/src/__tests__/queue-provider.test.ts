import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSqsEnqueue = vi.hoisted(() => vi.fn());
const mockCreateTask = vi.hoisted(() => vi.fn());

vi.mock('../lib/sqs-enqueue.js', () => ({
  enqueueSummaryJob: mockSqsEnqueue,
  validateSqsConfig: () => [],
}));

vi.mock('@google-cloud/tasks', () => ({
  CloudTasksClient: vi.fn(() => ({
    queuePath: (project: string, location: string, queue: string) =>
      `projects/${project}/locations/${location}/queues/${queue}`,
    createTask: mockCreateTask,
  })),
}));

import {
  enqueueSummaryJob,
  validateCloudTasksConfig,
} from '../lib/summary-enqueue.js';

const CLOUD_TASKS_ENV = {
  CLOUD_TASKS_PROJECT_ID: 'evia-500215',
  CLOUD_TASKS_QUEUE: 'evia-summary-queue-beta',
  CLOUD_TASKS_LOCATION: 'asia-south1',
  CLOUD_TASKS_WORKER_URL: 'https://evia-worker-xxxx.a.run.app',
  WORKER_SERVICE_ACCOUNT_EMAIL: 'evia-app@evia-500215.iam.gserviceaccount.com',
} as const;

describe('queue provider dispatch (summary-enqueue.ts)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of [...Object.keys(CLOUD_TASKS_ENV), 'OKUVU_QUEUE_PROVIDER', 'NODE_ENV'] as const) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    Object.assign(process.env, CLOUD_TASKS_ENV);
    mockCreateTask.mockResolvedValue([{ name: 'task-1' }]);
    mockSqsEnqueue.mockResolvedValue(undefined);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('defaults to Cloud Tasks when OKUVU_QUEUE_PROVIDER is unset', async () => {
    await enqueueSummaryJob('session-1', 'user-1');

    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    expect(mockSqsEnqueue).not.toHaveBeenCalled();

    const [request] = mockCreateTask.mock.calls[0];
    expect(request.parent).toBe('projects/evia-500215/locations/asia-south1/queues/evia-summary-queue-beta');
    expect(request.task.httpRequest.oidcToken.serviceAccountEmail).toBe(
      CLOUD_TASKS_ENV.WORKER_SERVICE_ACCOUNT_EMAIL,
    );
    expect(Buffer.from(request.task.httpRequest.body, 'base64').toString()).toBe(
      JSON.stringify({ session_id: 'session-1', user_id: 'user-1' }),
    );
  });

  it('delegates to the SQS producer when OKUVU_QUEUE_PROVIDER=sqs', async () => {
    process.env.OKUVU_QUEUE_PROVIDER = 'sqs';
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    await enqueueSummaryJob('session-1', 'user-1', log);

    expect(mockSqsEnqueue).toHaveBeenCalledWith('session-1', 'user-1', log);
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  it('propagates rejections from the SQS producer unchanged', async () => {
    process.env.OKUVU_QUEUE_PROVIDER = 'sqs';
    mockSqsEnqueue.mockRejectedValue(new Error('sqs down'));

    await expect(enqueueSummaryJob('session-1', 'user-1')).rejects.toThrow('sqs down');
  });

  it('rejects a mistyped provider instead of silently staying on Cloud Tasks', async () => {
    process.env.OKUVU_QUEUE_PROVIDER = 'sqs-queue';

    await expect(enqueueSummaryJob('session-1', 'user-1')).rejects.toThrow(
      /OKUVU_QUEUE_PROVIDER/,
    );
    expect(mockCreateTask).not.toHaveBeenCalled();
    expect(mockSqsEnqueue).not.toHaveBeenCalled();
  });

  it('keeps validateCloudTasksConfig reporting the Cloud Tasks variable names', () => {
    for (const key of Object.keys(CLOUD_TASKS_ENV)) delete process.env[key];

    expect(validateCloudTasksConfig()).toEqual(Object.keys(CLOUD_TASKS_ENV));
  });
});
