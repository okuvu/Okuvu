import { router } from "../trpc";
import { adminRouter } from "./admin";
import { clientsRouter } from "./clients";
import { notesRouter } from "./notes";
import { homeworkRouter } from "./homework";

export const appRouter = router({
  clients: clientsRouter,
  notes: notesRouter,
  homework: homeworkRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
