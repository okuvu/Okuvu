/**
 * TH-S39 — the testing.okuvu.in run loop.
 *
 * Two differences from the `/campaign` screen, both deliberate:
 *
 *   1. A transcript email goes out per persona the moment that conversation
 *      reaches a terminal state. `/campaign` stays silent on purpose — it is
 *      the grading screen, and nobody expects a clinical reviewer's inbox to
 *      fill up because someone clicked through a results table.
 *   2. The email is sent from the terminal `advance` step itself, not by a
 *      background sweep, so the person who pressed Run sees a delivery
 *      result in the same screen that showed the run.
 *
 * Idempotency lives in `emailGroupTranscript` (an existing `sent` row
 * short-circuits), so a duplicated advance tick cannot double-mail. A failed
 * send is retried by `resend` against the stored body — the conversation is
 * never re-run to re-send an email.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@okuvu/prisma';
import { protectedProcedure, router } from '../trpc';
import {
  advanceCampaignGroup,
  loadGroupEvidence,
  nextRunnableGroup,
  refreshCampaignStatus,
} from '@/lib/campaign-runner';
import { foldGroupVerdict } from '@/lib/campaign-verdict';
import { emailGroupTranscript, DEFAULT_TRANSCRIPT_RECIPIENT } from '@/lib/transcript-email';
import { mailerConfig } from '@/lib/composio-mailer';
import { OPERATOR_ACCOUNTS } from '@/lib/operator-access';

function requirePrisma(client: PrismaClient | null): PrismaClient {
  if (!client) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured — DATABASE_URL is unset.' });
  }
  return client;
}

const TERMINAL = new Set(['complete', 'incomplete', 'halt']);

export const testingRouter = router({
  /**
   * What this page will do, before anything runs: who gets the mail, whether
   * the mailbox credential is present, and the fixed plan. Read-only.
   */
  config: protectedProcedure.query(() => {
    const config = mailerConfig();
    return {
      recipient: (process.env.TRANSCRIPT_EMAIL_TO ?? DEFAULT_TRANSCRIPT_RECIPIENT).trim(),
      fromEmail: config?.fromEmail ?? 'admin@okuvu.in',
      emailConfigured: Boolean(config),
      sessions: 1,
      turnsMin: 15,
      turnsMax: 20,
      environment: 'staging' as const,
      operators: OPERATOR_ACCOUNTS.map((account) => account.email),
    };
  }),

  /**
   * Run the next step of the next unfinished conversation, and mail its
   * transcript when that conversation finishes.
   */
  advance: protectedProcedure
    .input(z.object({ campaignId: z.string().min(1), steps: z.number().int().min(1).max(3).default(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = requirePrisma(ctx.prisma);

      const campaign = await db.campaign.findUnique({ where: { id: input.campaignId } });
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: `No campaign '${input.campaignId}'.` });

      const outcomes = [];
      for (let step = 0; step < input.steps; step++) {
        const groupId = await nextRunnableGroup(input.campaignId);
        if (!groupId) break;

        const outcome = await advanceCampaignGroup(groupId);

        let email: Awaited<ReturnType<typeof emailGroupTranscript>> | null = null;
        if (TERMINAL.has(outcome.groupStatus)) {
          try {
            email = await emailGroupTranscript(groupId, { db });
          } catch (error) {
            email = {
              status: 'failed',
              to: (process.env.TRANSCRIPT_EMAIL_TO ?? DEFAULT_TRANSCRIPT_RECIPIENT).trim(),
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }

        outcomes.push({ ...outcome, email });
      }

      const status = await refreshCampaignStatus(input.campaignId);
      const remaining = await db.conversationRun.count({
        where: { campaign_id: input.campaignId, status: { in: ['planned', 'running'] } },
      });

      return { outcomes, status, remaining, done: remaining === 0 };
    }),

  /** Every conversation in a campaign with its turns stored and its mail state. */
  results: protectedProcedure
    .input(z.object({ campaignId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = requirePrisma(ctx.prisma);

      const campaign = await db.campaign.findUnique({ where: { id: input.campaignId } });
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: `No campaign '${input.campaignId}'.` });

      const groups = await db.conversationRun.findMany({
        where: { campaign_id: input.campaignId },
        orderBy: { created_at: 'asc' },
      });

      const rows = [];
      for (const group of groups) {
        const loaded = await loadGroupEvidence(group.id);
        const email = await db.transcriptEmail.findFirst({
          where: { group_id: group.id },
          orderBy: { created_at: 'desc' },
        });
        const personaCase = await db.corpusCase.findUnique({ where: { id: group.persona_case_id } });
        const meta = (personaCase?.persona_meta ?? {}) as Record<string, unknown>;

        rows.push({
          groupId: group.id,
          personaId: group.persona_id,
          personaVersion: group.persona_version,
          demographics: typeof meta.demographics === 'string' ? meta.demographics : null,
          profile: typeof meta.profile === 'string' ? meta.profile : null,
          status: group.status,
          incompleteReason: group.incomplete_reason ?? null,
          turnsCompleted: loaded?.turns.length ?? 0,
          costSoFarUsd: loaded?.costSoFarUsd ?? 0,
          verdict: loaded ? foldGroupVerdict(loaded.evidence).verdict : 'INCOMPLETE',
          findings: loaded ? foldGroupVerdict(loaded.evidence).findings : [],
          email: email
            ? {
                status: email.status,
                to: email.to_email,
                subject: email.subject,
                sentAt: email.sent_at?.toISOString() ?? null,
                messageId: email.provider_message_id,
                error: email.error,
              }
            : null,
        });
      }

      return {
        campaign: {
          id: campaign.id,
          label: campaign.label,
          status: campaign.status,
          environment: campaign.environment,
          turnsMin: campaign.turns_min,
          turnsMax: campaign.turns_max,
          createdAt: campaign.created_at.toISOString(),
          createdBy: campaign.created_by,
        },
        rows,
      };
    }),

  /** Re-send one conversation's transcript from the stored body. */
  resend: protectedProcedure
    .input(z.object({ groupId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = requirePrisma(ctx.prisma);
      return emailGroupTranscript(input.groupId, { db });
    }),
});
