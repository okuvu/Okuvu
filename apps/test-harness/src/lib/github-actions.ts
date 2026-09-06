// TH-S27 — thin GitHub Actions REST API client.
//
// Deliberately implemented with plain `fetch` rather than the `octokit`
// package: no octokit dependency exists anywhere in this workspace (checked
// all package.json files), and the surface area needed here (list workflow
// runs, get one run, trigger a workflow_dispatch) is three simple REST
// calls — adding a new dependency for that isn't justified.
//
// Config comes from `GITHUB_TOKEN` / `GITHUB_REPO` (format `owner/repo`),
// read directly from process.env rather than through lib/env.ts's zod
// schema, since both are optional-in-practice (this environment has no real
// GitHub token configured) and every caller needs to handle "not
// configured" as an expected, catchable state rather than a crash.

export class GitHubActionsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubActionsConfigError';
  }
}

export interface WorkflowRunSummary {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
}

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

function getConfig(): GitHubConfig {
  const token = process.env.GITHUB_TOKEN;
  const repoSlug = process.env.GITHUB_REPO;

  if (!token || !repoSlug) {
    throw new GitHubActionsConfigError(
      'GITHUB_TOKEN/GITHUB_REPO not configured — set both env vars to enable CI regression status/trigger.',
    );
  }

  const [owner, repo] = repoSlug.split('/');
  if (!owner || !repo) {
    throw new GitHubActionsConfigError(
      `GITHUB_REPO must be in "owner/repo" form, got: "${repoSlug}"`,
    );
  }

  return { token, owner, repo };
}

function apiBase(config: GitHubConfig): string {
  return `https://api.github.com/repos/${config.owner}/${config.repo}`;
}

function authHeaders(config: GitHubConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * List recent runs of a given workflow file (e.g. 'regression.yml'),
 * newest first, as returned by GitHub's `workflow_runs` list endpoint.
 */
export async function listWorkflowRuns(
  workflowFileName: string,
): Promise<WorkflowRunSummary[]> {
  const config = getConfig();
  const url = `${apiBase(config)}/actions/workflows/${encodeURIComponent(
    workflowFileName,
  )}/runs?per_page=20`;

  const response = await fetch(url, { headers: authHeaders(config) });
  if (!response.ok) {
    throw new Error(
      `GitHub Actions API error listing runs for ${workflowFileName}: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as {
    workflow_runs: Array<{
      id: number;
      status: string;
      conclusion: string | null;
      created_at: string;
      html_url: string;
    }>;
  };

  return body.workflow_runs.map((run) => ({
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    created_at: run.created_at,
    html_url: run.html_url,
  }));
}

/** Fetch a single workflow run by its numeric run id. */
export async function getWorkflowRun(runId: number): Promise<WorkflowRunSummary> {
  const config = getConfig();
  const url = `${apiBase(config)}/actions/runs/${runId}`;

  const response = await fetch(url, { headers: authHeaders(config) });
  if (!response.ok) {
    throw new Error(
      `GitHub Actions API error fetching run ${runId}: ${response.status} ${response.statusText}`,
    );
  }

  const run = (await response.json()) as {
    id: number;
    status: string;
    conclusion: string | null;
    created_at: string;
    html_url: string;
  };

  return {
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    created_at: run.created_at,
    html_url: run.html_url,
  };
}

/**
 * Trigger a `workflow_dispatch` event for the given workflow file. The
 * workflow must declare `on: workflow_dispatch` (regression.yml does) for
 * this to succeed. Returns nothing on success — GitHub's dispatch endpoint
 * responds 204 with no body.
 */
export async function triggerWorkflowDispatch(
  workflowFileName: string,
  ref = 'develop',
): Promise<void> {
  const config = getConfig();
  const url = `${apiBase(config)}/actions/workflows/${encodeURIComponent(
    workflowFileName,
  )}/dispatches`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { ...authHeaders(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref }),
  });

  if (!response.ok) {
    throw new Error(
      `GitHub Actions API error triggering ${workflowFileName}: ${response.status} ${response.statusText}`,
    );
  }
}
