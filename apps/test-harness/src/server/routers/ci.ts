import { TRPCError } from '@trpc/server';
import type { TestRunStatus } from '@okuvu/shared-types';
import { protectedProcedure, router } from '../trpc';
import {
  listWorkflowRuns,
  triggerWorkflowDispatch,
  GitHubActionsConfigError,
  type WorkflowRunSummary,
} from '../../lib/github-actions';

const REGRESSION_WORKFLOW_FILE = 'regression.yml';

export interface GateStatusRun extends WorkflowRunSummary {
  /** GitHub's own status/conclusion vocabulary mapped onto this app's
   * TestRunStatus, so `RunStatusBadge` can render CI runs identically to
   * TestRun rows elsewhere in the harness. */
  mappedStatus: TestRunStatus;
}

/**
 * Map a GitHub Actions run (status + conclusion) onto this app's own
 * TestRunStatus vocabulary ('running' | 'pass' | 'halt' | 'warning' |
 * 'error') for consistent display with RunStatusBadge.
 *
 *  - status !== 'completed'                -> 'running' (queued/in_progress)
 *  - conclusion === 'success'               -> 'pass'
 *  - conclusion === 'failure'                -> 'halt'
 *  - conclusion === 'cancelled'              -> 'error'
 *  - conclusion === 'timed_out'              -> 'error'
 *  - conclusion === 'action_required'        -> 'warning'
 *  - conclusion === null (completed, no verdict yet) -> 'error'
 *  - anything else unrecognized              -> 'error'
 */
function mapConclusionToRunStatus(run: WorkflowRunSummary): TestRunStatus {
  if (run.status !== 'completed') {
    return 'running';
  }
  switch (run.conclusion) {
    case 'success':
      return 'pass';
    case 'failure':
      return 'halt';
    case 'action_required':
    case 'stale':
      return 'warning';
    case 'cancelled':
    case 'timed_out':
    case 'neutral':
    case 'skipped':
    default:
      return 'error';
  }
}

function toConfigError(error: unknown): TRPCError {
  if (error instanceof GitHubActionsConfigError) {
    return new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'GITHUB_TOKEN/GITHUB_REPO not configured',
    });
  }
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: error instanceof Error ? error.message : 'Unknown GitHub Actions API error',
  });
}

async function fetchGateStatus(): Promise<GateStatusRun[]> {
  const runs = await listWorkflowRuns(REGRESSION_WORKFLOW_FILE);
  return runs.map((run) => ({ ...run, mappedStatus: mapConclusionToRunStatus(run) }));
}

export const ciRouter = router({
  /**
   * TH-S27: current CI regression gate status, sourced from
   * .github/workflows/regression.yml's run history via the GitHub Actions
   * REST API. Each run's GitHub conclusion is mapped onto this app's own
   * TestRunStatus vocabulary so the UI can reuse RunStatusBadge.
   */
  getGateStatus: protectedProcedure.query(async () => {
    try {
      return await fetchGateStatus();
    } catch (error) {
      throw toConfigError(error);
    }
  }),

  /**
   * TH-S27: manually trigger a regression.yml run via workflow_dispatch.
   *
   * Restricted to PI/ENGINEER roles — the story does not mandate a specific
   * role, but triggering a CI workflow run (and consuming Actions minutes)
   * is closer to an operational action than a read; RATER accounts (which
   * exist purely for scoring/review work) have no reason to trigger CI, so
   * this procedure rejects them defensively rather than leaving trigger
   * access unrestricted to every authenticated harness user.
   */
  triggerRegression: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== 'PI' && ctx.user.role !== 'ENGINEER') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only PI or ENGINEER roles may trigger a regression run',
      });
    }
    try {
      await triggerWorkflowDispatch(REGRESSION_WORKFLOW_FILE);
      return { triggered: true };
    } catch (error) {
      throw toConfigError(error);
    }
  }),

  /**
   * TH-S27: the subset of getGateStatus's runs that HALTed (GitHub
   * conclusion 'failure'), each carrying its html_url for drill-down into
   * the actual GitHub Actions log.
   */
  getHaltFailures: protectedProcedure.query(async () => {
    try {
      const runs = await fetchGateStatus();
      return runs.filter((run) => run.mappedStatus === 'halt');
    } catch (error) {
      throw toConfigError(error);
    }
  }),
});
