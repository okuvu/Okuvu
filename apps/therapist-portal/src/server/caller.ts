import { appRouter } from './routers/_app';
import { createTRPCContext } from './trpc';

export async function createCaller(headers: Headers) {
  const ctx = await createTRPCContext({ headers });
  return appRouter.createCaller(ctx);
}
