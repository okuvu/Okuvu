import { router } from "../trpc";
import { adminRouter } from "./admin";
import { clientsRouter } from "./clients";
import { notesRouter } from "./notes";

export const appRouter = router({
  clients: clientsRouter,
  notes: notesRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
