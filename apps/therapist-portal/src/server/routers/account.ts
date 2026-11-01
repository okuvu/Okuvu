import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { checkRateLimit } from '../rate-limit';
import { changeCognitoPassword } from '@/lib/cognito-password';
import { identityRef } from '@/lib/log-identity';

/**
 * Self-service account operations.
 *
 * `changePassword` is a plain protectedProcedure, not an admin one: a therapist
 * changing their own password is the main case, and the operator is just
 * another signed-in address. The identity is always the session's, never an
 * input — there is no email field on this mutation and there should never be
 * one, or it becomes a password-set primitive for any address.
 *
 * Rate limited per address: the rate limiter is the only thing between this and
 * a slow brute force of the current password (Cognito's own lockout also
 * applies, but it is pool-wide and worth staying clear of).
 */
export const accountRouter = router({
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1).max(256),
        newPassword: z.string().min(1).max(256),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = ctx.user.email;
      if (!email) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'No email on session',
        });
      }

      if (!checkRateLimit(`password:${email.toLowerCase()}`, 5, 10 * 60_000)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many attempts. Wait a few minutes and try again.',
        });
      }

      if (input.currentPassword === input.newPassword) {
        return {
          ok: false as const,
          code: 'REUSED_PASSWORD' as const,
          message: 'The new password is the same as the current one.',
        };
      }

      const result = await changeCognitoPassword({
        email,
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });

      // Same discipline as sign-in logging: a stable reference and the outcome,
      // never the address and never either password.
      if (result.ok) {
        console.log(`[ACCOUNT] Password changed ref=${identityRef('p', email)}`);
      } else {
        console.warn(
          `[ACCOUNT] Password change refused code=${result.code} ref=${identityRef('p', email)}`,
        );
      }

      return result;
    }),
});
