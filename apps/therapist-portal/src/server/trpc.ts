import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function createTRPCContext(opts: { headers: Headers }) {
  const session = await auth();
  return { session, prisma, ...opts };
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;
export type ProtectedContext = Context & { user: NonNullable<Context['session']>['user'] };

const t = initTRPC.context<Context>().create();

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, user: ctx.session.user } });
});

export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
export const router = t.router;
