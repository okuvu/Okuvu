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
import { worksheetsRouter } from "./worksheets";
import { safetyPlanRouter } from "./safety-plan";

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
  worksheets: worksheetsRouter,
  safetyPlan: safetyPlanRouter,
});

export type AppRouter = typeof appRouter;
