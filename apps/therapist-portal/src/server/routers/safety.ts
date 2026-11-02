/**
 * Safety — the therapist-facing view of S3/S4 events.
 *
 * `SafetyState` gives the current level; this router gives the *history* the
 * Safety card needs: what happened, when, which screen the client received,
 * and whether the therapist has looked at it yet.
 *
 * Two rules the shape of this file enforces:
 *
 * 1. No conversation content. A flag row carries a level, a time and a source
 *    — never a message. The therapist reaches this card from an email and a
 *    banner; neither is a place to read a transcript.
 * 2. Acknowledgement is permanent. `acknowledge` only ever fills an empty
 *    `acknowledged_at`; there is no un-acknowledge path, and a repeat call
 *    returns the original record rather than rewriting who looked at it.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  assertClientAssigned,
  isBypassEnabled,
  logClinicalAccess,
  router,
  therapistMutation,
  therapistProcedure,
} from "../trpc";

/** One row of the Safety card's history list. */
export interface SafetyFlagView {
  id: string;
  level: "S3" | "S4";
  occurredAt: string;
  crisisScreenShown: boolean;
  source: string | null;
  acknowledgedAt: string | null;
}

/** What the Dashboard needs per client — one entry per assigned client. */
export interface RosterSafetySummary {
  clientUserId: string;
  /** Unacknowledged flags at any level; the banner counts these. */
  unacknowledgedCount: number;
  /** Newest flag of any acknowledgement state, or null when none ever. */
  latest: {
    level: "S3" | "S4";
    occurredAt: string;
    acknowledgedAt: string | null;
  } | null;
}

const MAX_FLAGS_RETURNED = 100;

export const safetyRouter = router({
  /**
   * Roster summary for the Dashboard: latest flag per client plus the
   * unacknowledged count. Two bounded queries rather than one unbounded list:
   * a max(occurred_at) per client, then the few rows that carry those times.
   */
  rosterSummary: therapistProcedure.query(async ({ ctx }): Promise<RosterSafetySummary[]> => {
    const db = ctx.db;
    const therapistId = ctx.therapistId;

    const assignments = await db.therapistClient.findMany({
      where: { therapist_id: therapistId },
      select: { client_user_id: true },
    });
    const clientIds = assignments.map((a) => a.client_user_id);
    if (clientIds.length === 0) return [];

    const [latestGroups, unackGroups] = await Promise.all([
      db.safetyFlag.groupBy({
        by: ["user_id"],
        where: { user_id: { in: clientIds } },
        _max: { occurred_at: true },
      }),
      db.safetyFlag.groupBy({
        by: ["user_id"],
        where: { user_id: { in: clientIds }, acknowledged_at: null },
        _count: { _all: true },
        _max: { occurred_at: true },
      }),
    ]);

    const unackCounts = new Map<string, number>();
    for (const group of unackGroups as Array<{ user_id: string; _count?: { _all?: number } }>) {
      unackCounts.set(group.user_id, group._count?._all ?? 0);
    }

    const latestTimes = latestGroups as Array<{ user_id: string; _max: { occurred_at: Date | null } }>;
    const wanted = latestTimes
      .map((group) => ({ user_id: group.user_id, occurred_at: group._max.occurred_at }))
      .filter((pair): pair is { user_id: string; occurred_at: Date } => pair.occurred_at !== null);

    const latestRows = wanted.length
      ? await db.safetyFlag.findMany({
          where: {
            OR: wanted.map((pair) => ({ user_id: pair.user_id, occurred_at: pair.occurred_at })),
          },
          select: {
            user_id: true,
            level: true,
            occurred_at: true,
            acknowledged_at: true,
          },
        })
      : [];

    const latestByClient = new Map<string, RosterSafetySummary["latest"]>();
    for (const row of latestRows) {
      const existing = latestByClient.get(row.user_id);
      if (existing && existing.occurredAt >= row.occurred_at.toISOString()) continue;
      latestByClient.set(row.user_id, {
        level: row.level,
        occurredAt: row.occurred_at.toISOString(),
        acknowledgedAt: row.acknowledged_at?.toISOString() ?? null,
      });
    }

    return clientIds.map((clientUserId) => ({
      clientUserId,
      unacknowledgedCount: unackCounts.get(clientUserId) ?? 0,
      latest: latestByClient.get(clientUserId) ?? null,
    }));
  }),

  /** The Safety card's history list, newest first. */
  flagsForClient: therapistProcedure
    .input(z.object({ clientUserId: z.string().min(1), limit: z.number().int().min(1).max(MAX_FLAGS_RETURNED).default(20) }))
    .query(async ({ ctx, input }): Promise<SafetyFlagView[]> => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      if (!isBypassEnabled()) {
        await assertClientAssigned(db, therapistId, input.clientUserId);
      }

      const rows = await db.safetyFlag.findMany({
        where: { user_id: input.clientUserId },
        orderBy: { occurred_at: "desc" },
        take: input.limit,
        select: {
          id: true,
          level: true,
          occurred_at: true,
          crisis_screen_shown: true,
          source: true,
          acknowledged_at: true,
        },
      });

      return rows.map((row) => ({
        id: row.id,
        level: row.level,
        occurredAt: row.occurred_at.toISOString(),
        crisisScreenShown: row.crisis_screen_shown,
        source: row.source ?? null,
        acknowledgedAt: row.acknowledged_at?.toISOString() ?? null,
      }));
    }),

  /**
   * "I have seen this." Records the therapist and the time. Permanent: a
   * second call returns the first acknowledgement untouched, so the record
   * always names the person who actually read it.
   */
  acknowledge: therapistMutation
    .input(z.object({ flagId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      const flag = await db.safetyFlag.findUnique({
        where: { id: input.flagId },
        select: { id: true, user_id: true, acknowledged_at: true },
      });
      if (!flag) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Safety flag not found" });
      }

      if (!isBypassEnabled()) {
        await assertClientAssigned(db, therapistId, flag.user_id);
        await logClinicalAccess(db, therapistId, flag.user_id, "ACKNOWLEDGE_SAFETY_FLAG");
      }

      if (flag.acknowledged_at) {
        return {
          success: true,
          alreadyAcknowledged: true,
          acknowledgedAt: flag.acknowledged_at.toISOString(),
        };
      }

      const acknowledgedAt = new Date();
      await db.safetyFlag.update({
        where: { id: flag.id },
        data: {
          acknowledged_at: acknowledgedAt,
          acknowledged_by_therapist_id: isBypassEnabled() ? null : therapistId,
        },
      });

      return {
        success: true,
        alreadyAcknowledged: false,
        acknowledgedAt: acknowledgedAt.toISOString(),
      };
    }),
});
