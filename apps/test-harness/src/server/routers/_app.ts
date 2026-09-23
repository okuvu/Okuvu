import { router } from '../trpc';
import { exampleRouter } from './example';
import { dashboardRouter } from './dashboard';
import { testConfigRouter } from './testConfig';
import { singleAgentRouter } from './singleAgent';
import { faultInjectionRouter } from './faultInjection';
import { determinismRouter } from './determinism';
import { stochasticRouter } from './stochastic';
import { pipelineRouter } from './pipeline';
import { reviewRouter } from './review';
import { corpusRouter } from './corpus';
import { resultsRouter } from './results';
import { consentRouter } from './consent';
import { conversationRouter } from './conversation';
import { ciRouter } from './ci';
import { simulatorRouter } from './simulator';
import { scorecardRouter } from './scorecard';
import { resultsExportRouter } from './results-export';

export const appRouter = router({
  example: exampleRouter,
  dashboard: dashboardRouter,
  testConfig: testConfigRouter,
  singleAgent: singleAgentRouter,
  faultInjection: faultInjectionRouter,
  determinism: determinismRouter,
  stochastic: stochasticRouter,
  pipeline: pipelineRouter,
  review: reviewRouter,
  corpus: corpusRouter,
  results: resultsRouter,
  consent: consentRouter,
  conversation: conversationRouter,
  ci: ciRouter,
  simulator: simulatorRouter,
  scorecard: scorecardRouter,
  resultsExport: resultsExportRouter,
});

export type AppRouter = typeof appRouter;
