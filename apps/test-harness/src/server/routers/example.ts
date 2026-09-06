import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../trpc';

export const exampleRouter = router({
  health: publicProcedure.query(() => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })),

  hello: publicProcedure.query(() => ({
    message: 'Hello from Test Harness tRPC!',
  })),

  getMe: protectedProcedure.query(({ ctx }) => ({
    email: ctx.user.email,
    name: ctx.user.name,
  })),

  echo: publicProcedure
    .input(z.object({ message: z.string() }))
    .query(({ input }) => ({ echoed: input.message })),
});
