import { router } from "../trpc";
import { adminRouter } from "./admin";
import { clientsRouter } from "./clients";
import { notesRouter } from "./notes";
import { homeworkRouter } from "./homework";
import { remindersRouter } from "./reminders";
import { reportCardRouter } from "./report-card";
import { appointmentsRouter } from "./appointments";
import { accountRouter } from "./account";
import { safetyRouter } from "./safety";

export const appRouter = router({
  clients: clientsRouter,
  notes: notesRouter,
  homework: homeworkRouter,
  reminders: remindersRouter,
  reportCard: reportCardRouter,
  admin: adminRouter,
  appointments: appointmentsRouter,
  account: accountRouter,
  safety: safetyRouter,
});

export type AppRouter = typeof appRouter;
