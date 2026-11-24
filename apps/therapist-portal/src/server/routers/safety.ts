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
import { answersToReadableText } from "../answer-text";

/** One row of the Safety card's history list. */
export interface SafetyFlagView {
  id: string;
  level: "S3" | "S4";
  occurredAt: string;
  crisisScreenShown: boolean;
  source: string | null;
  acknowledgedAt: string | null;
  /**
   * The harm-to-someone screen (owner's approval, 24 Nov 2026). Urgent flags
   * lead the card, and they are the only rows that carry `words`.
   */
  urgent: boolean;
  /**
   * The client's own words, for an urgent harm-to-someone flag only.
   *
   * The flag itself stores no text. This is read from the worksheet answer the
   * flag points at (`subject_kind` + `subject_id`), which the client has not
   * shared — the owner asked for it so he can judge the disclosure himself.
   * Every other source keeps the old rule: the therapist sees the event, not
   * the words.
   */
  words: string | null;
  /** Which worksheet the words came from, when `words` is present. */
  wordsFrom: string | null;
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
        // Urgent first, then newest: an urgent flag is the one the therapist
        // needs before anything else, and it must not be scrolled for.
        orderBy: [{ urgent: "desc" }, { occurred_at: "desc" }],
        take: input.limit,
        select: {
          id: true,
          level: true,
          occurred_at: true,
          crisis_screen_shown: true,
          source: true,
          acknowledged_at: true,
          urgent: true,
          subject_kind: true,
          subject_id: true,
          // Chat-sourced flags point at the assistant Turn instead of a
          // worksheet answer; the user's words are the sibling Turn with the
          // same turn_number in the same session.
          turn_id: true,
          session_id: true,
        },
      });

      const views = rows.map((row) => ({
        id: row.id,
        level: row.level,
        occurredAt: row.occurred_at.toISOString(),
        crisisScreenShown: row.crisis_screen_shown,
        source: row.source ?? null,
        acknowledgedAt: row.acknowledged_at?.toISOString() ?? null,
        urgent: row.urgent === true,
        words: null as string | null,
        wordsFrom: null as string | null,
        subjectKind: row.subject_kind ?? null,
        subjectId: row.subject_id ?? null,
        turnId: row.turn_id ?? null,
        sessionId: row.session_id ?? null,
      }));

      // The client's own words, for the urgent harm-to-someone rows only.
      // Read from the row the flag points at, never stored on the flag. Two
      // pointers exist because the same disclosure can arrive from a worksheet
      // answer or from chat (owner's rule, 24 Nov 2026): a worksheet answer row,
      // or the user Turn that precedes the assistant Turn the flag names.
      const wantWords = views.filter(
        (view) =>
          view.urgent &&
          view.source === "harm_to_someone" &&
          ((view.subjectKind === "worksheet_response" && view.subjectId !== null) ||
            (view.turnId !== null && view.sessionId !== null)),
      );
      if (wantWords.length > 0) {
        if (!isBypassEnabled()) {
          await logClinicalAccess(db, therapistId, input.clientUserId, "READ_HARM_TO_SOMEONE_WORDS");
        }
        for (const view of wantWords) {
          try {
            if (view.subjectKind === "worksheet_response" && view.subjectId) {
              const answer = await db.worksheetResponse.findFirst({
                where: { id: view.subjectId, user_id: input.clientUserId },
                select: { worksheet_id: true, answers: true },
              });
              if (!answer) continue;
              view.words = answersToReadableText(answer.answers);
              view.wordsFrom = answer.worksheet_id;
              continue;
            }
            // Chat: the flag names the assistant Turn. The client's words are
            // the user Turn at the same turn_number in the same session.
            const assistant = await db.turn.findFirst({
              where: { id: view.turnId!, user_id: input.clientUserId },
              select: { session_id: true, turn_number: true },
            });
            if (!assistant) continue;
            const said = await db.turn.findFirst({
              where: {
                session_id: assistant.session_id,
                turn_number: assistant.turn_number,
                user_id: input.clientUserId,
                role: "user",
              },
              select: { content: true },
            });
            if (!said) continue;
            view.words = said.content;
            view.wordsFrom = "chat";
          } catch (err) {
            // The words are a reading aid; the flag is the record. A failed
            // read must not take the Safety card down with it.
            console.error("[safety] could not read the flagged answer", err);
          }
        }
      }

      return views.map(({ subjectKind: _k, subjectId: _i, turnId: _t, sessionId: _s, ...view }) => view);
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
