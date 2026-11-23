/**
 * TH-S39 — the transcript email a clinical reviewer actually reads.
 *
 * The deliverable of this loop is Shubhangi's judgement of a real
 * conversation, not a PASS count. So the body is the whole conversation,
 * verbatim and in order, with a persona header that says who spoke and why,
 * and a short context block underneath. There is deliberately no verdict and
 * no pass/fail line: presenting a judge score as the point of the email
 * invites prompt edits nobody asked for.
 *
 * Rendering is pure (`renderTranscriptEmail`) so it can be unit-tested and so
 * the stored body is byte-identical to the sent body — the archive copy is what
 * was mailed, never a re-render against later data.
 */

import type { PrismaClient } from '@okuvu/prisma';
import { prisma } from './prisma';
import { sendPlainEmail, mailerConfig } from './composio-mailer';
import type { PerTurnTrace } from './trace-export';

export const DEFAULT_TRANSCRIPT_RECIPIENT = 'alphashubhangi@gmail.com';

export interface TranscriptEmailInput {
  personaId: string;
  personaVersion: string;
  recipient: string;
  fromEmail: string;
  /** Character sheet, for the header. */
  demographics: string | null;
  profile: string | null;
  goals: string[];
  /** Plan + provenance context. */
  campaignId: string | null;
  environment: string;
  turnCount: number;
  seed: number | null;
  turns: PerTurnTrace[];
  /** Deterministic rule findings, shown as context only. */
  findings: { turnNumber: number | null; rule: string; severity: string; detail: string }[];
  generatedAt: Date;
}

export interface RenderedEmail {
  subject: string;
  body: string;
  turnCount: number;
}

function wrap(text: string, width = 78): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line === '') {
      line = word;
    } else if ((line + ' ' + word).length <= width) {
      line += ' ' + word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

/** Indent a speaker's text so a long turn still reads as one block. */
function block(speaker: string, text: string): string {
  const wrapped = wrap(text.trim()).split('\n').join('\n    ');
  return `${speaker}:\n    ${wrapped}`;
}

export function renderTranscriptEmail(input: TranscriptEmailInput): RenderedEmail {
  const label = input.demographics ? `${input.personaId} — ${input.demographics}` : input.personaId;
  const subject = `Okuvu chat test — ${label} (${input.turnCount} turns)`;

  const header: string[] = [];
  header.push('OKUVU CHAT QUALITY TEST — CONVERSATION TRANSCRIPT');
  header.push('='.repeat(60));
  header.push(`Persona:      ${input.personaId} (v${input.personaVersion})`);
  if (input.demographics) header.push(`Character:    ${input.demographics}`);
  if (input.profile) header.push(`Situation:    ${wrap(input.profile, 74).split('\n').join('\n              ')}`);
  if (input.goals.length > 0) header.push(`Wants:        ${input.goals.join('; ')}`);
  header.push(
    `Run:          ${input.turnCount} turns · ${input.environment} (in-process pipeline)` +
      (input.seed === null ? '' : ` · seed ${input.seed}`),
  );
  if (input.campaignId) header.push(`Campaign:     ${input.campaignId}`);
  header.push(`Generated:    ${input.generatedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`);
  header.push('');
  header.push('The client turns below are produced by a simulated client following the');
  header.push('character sheet above. The Okuvu turns are the product\'s own replies.');
  header.push('');

  const conversation: string[] = [];
  for (const turn of input.turns) {
    conversation.push(`--- Turn ${turn.turnNumber} ---`);
    conversation.push(block('Client', turn.message));
    conversation.push(block('Okuvu', turn.response ?? '[no reply recorded]'));
    conversation.push('');
  }

  const notes: string[] = [];
  notes.push('-'.repeat(60));
  notes.push('CONTEXT (not a verdict — your read is the result)');
  notes.push('');
  const replies = input.turns.map((turn) => (turn.response ?? '').trim()).filter(Boolean);
  if (replies.length > 0) {
    const lengths = replies.map((reply) => reply.length).sort((a, b) => a - b);
    const mean = Math.round(lengths.reduce((total, value) => total + value, 0) / lengths.length);
    notes.push(`Reply length:  mean ${mean} characters, shortest ${lengths[0]}, longest ${lengths[lengths.length - 1]}.`);
  }
  const fallbacks = input.turns.filter((turn) => turn.fallbackUsed).length;
  const errors = input.turns.filter((turn) => turn.resultType === 'error').length;
  const crisis = input.turns.filter((turn) => turn.resultType === 'crisis').length;
  notes.push(`Turn outcomes: ${replies.length} replies, ${fallbacks} fallback, ${errors} error, ${crisis} crisis-routed.`);

  if (input.findings.length === 0) {
    notes.push('Automatic checks: no rule findings (repetition, re-onboarding, question-stacking,');
    notes.push('                  advice before validation, reply length).');
  } else {
    notes.push(`Automatic checks: ${input.findings.length} finding(s) —`);
    for (const finding of input.findings) {
      const where = finding.turnNumber === null ? 'whole conversation' : `turn ${finding.turnNumber}`;
      notes.push(`  ${where} · ${finding.rule} (${finding.severity}) — ${finding.detail}`);
    }
  }

  notes.push('');
  notes.push('Reply to this email with anything that reads wrong. A prompt revision follows');
  notes.push('the transcript, not the other way round.');

  const body = [...header, ...conversation, ...notes].join('\n');
  return { subject, body, turnCount: input.turns.length };
}

export interface EmailTranscriptOutcome {
  status: 'sent' | 'already_sent' | 'failed';
  to: string;
  messageId?: string;
  error?: string;
  rowId?: string;
}

/**
 * Render, store and send one group's transcript.
 *
 * Idempotent by group: an existing `sent` row short-circuits, so a retailed
 * advance tick or a second click cannot double-mail a clinician. A failed row
 * is reused (attempts incremented) rather than duplicated.
 */
export async function emailGroupTranscript(
  groupId: string,
  options: { db?: PrismaClient | null; recipient?: string } = {},
): Promise<EmailTranscriptOutcome> {
  const db = options.db ?? prisma;
  if (!db) throw new Error('Database not configured — DATABASE_URL is unset.');

  const recipient = (options.recipient ?? process.env.TRANSCRIPT_EMAIL_TO ?? DEFAULT_TRANSCRIPT_RECIPIENT).trim();
  const config = mailerConfig();
  const fromEmail = config?.fromEmail ?? 'admin@okuvu.in';

  const alreadySent = await db.transcriptEmail.findFirst({
    where: { group_id: groupId, status: 'sent' },
    orderBy: { created_at: 'desc' },
  });
  if (alreadySent) {
    return { status: 'already_sent', to: alreadySent.to_email, messageId: alreadySent.provider_message_id ?? undefined, rowId: alreadySent.id };
  }

  const { loadGroupEvidence } = await import('./campaign-runner');
  const { foldGroupVerdict } = await import('./campaign-verdict');

  const loaded = await loadGroupEvidence(groupId);
  if (!loaded) throw new Error(`No run group '${groupId}'.`);

  const group = await db.conversationRun.findUnique({ where: { id: groupId } });
  const personaCase = group ? await db.corpusCase.findUnique({ where: { id: group.persona_case_id } }) : null;
  const meta = (personaCase?.persona_meta ?? {}) as Record<string, unknown>;

  const verdict = foldGroupVerdict(loaded.evidence);
  const turns = loaded.turns
    .filter((turn) => !turn.trace || turn.trace.response !== undefined)
    .map((turn) => turn.trace)
    .sort((a, b) => a.turnNumber - b.turnNumber);

  const rendered = renderTranscriptEmail({
    personaId: loaded.personaId,
    personaVersion: loaded.personaVersion,
    recipient,
    fromEmail,
    demographics: typeof meta.demographics === 'string' ? meta.demographics : null,
    profile: typeof meta.profile === 'string' ? meta.profile : null,
    goals: Array.isArray(meta.goals) ? (meta.goals as string[]) : [],
    campaignId: group?.campaign_id ?? null,
    environment: group?.environment ?? 'staging',
    turnCount: turns.length,
    seed: group?.seed ?? null,
    turns,
    findings: verdict.findings.map((finding) => ({
      turnNumber: finding.turnNumber,
      rule: finding.rule,
      severity: finding.severity,
      detail: finding.detail,
    })),
    generatedAt: new Date(),
  });

  const existing = await db.transcriptEmail.findFirst({ where: { group_id: groupId }, orderBy: { created_at: 'desc' } });
  const row = existing
    ? await db.transcriptEmail.update({
        where: { id: existing.id },
        data: {
          to_email: recipient,
          from_email: fromEmail,
          subject: rendered.subject,
          body: rendered.body,
          turn_count: rendered.turnCount,
          attempts: { increment: 1 },
          status: 'pending',
          error: null,
        },
      })
    : await db.transcriptEmail.create({
        data: {
          campaign_id: group?.campaign_id ?? null,
          group_id: groupId,
          persona_id: loaded.personaId,
          to_email: recipient,
          from_email: fromEmail,
          subject: rendered.subject,
          body: rendered.body,
          turn_count: rendered.turnCount,
          attempts: 1,
          status: 'pending',
        },
      });

  try {
    const sent = await sendPlainEmail({ to: recipient, subject: rendered.subject, body: rendered.body }, config);
    await db.transcriptEmail.update({
      where: { id: row.id },
      data: { status: 'sent', provider_message_id: sent.messageId, sent_at: new Date(), error: null },
    });
    return { status: 'sent', to: recipient, messageId: sent.messageId, rowId: row.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.transcriptEmail.update({ where: { id: row.id }, data: { status: 'failed', error: message } });
    return { status: 'failed', to: recipient, error: message, rowId: row.id };
  }
}
