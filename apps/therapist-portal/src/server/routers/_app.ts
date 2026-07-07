import { router } from '../trpc';
import { exampleRouter } from './example';
import { notesRouter } from './notes';

export const appRouter = router({
  example: exampleRouter,
  notes: notesRouter,
});

export type AppRouter = typeof appRouter;
