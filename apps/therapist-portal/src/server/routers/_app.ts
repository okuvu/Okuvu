import { router } from "../trpc";
import { clientsRouter } from "./clients";
import { exampleRouter } from "./example";
import { notesRouter } from "./notes";

export const appRouter = router({
  clients: clientsRouter,
  example: exampleRouter,
  notes: notesRouter,
});

export type AppRouter = typeof appRouter;