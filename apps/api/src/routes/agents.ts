import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { ROSTER, type AgentSpec, type AgentWrite, validateRoster } from '../agents/roster.js';

/**
 * E17-S3 — the roster, over HTTP.
 *
 * The endpoint is a *view* of `agents/roster.ts`, not a second registry: every
 * field below is read out of `ROSTER` at request time, so an agent added to
 * `roster.ts` appears here without anyone editing this file. That is the
 * property that matters — the risk this story exists to remove is a list of
 * agents in one place and a list of agents in another drifting apart, which is
 * how the repo ended up with 4 of 15 agents and a document claiming otherwise.
 *
 * A9-post (pre-publication review of A2's draft) and J2 (journal-prompt
 * generator) are components, not roster members, and are absent by
 * construction: they have no entry in `ROSTER`, and `validateRoster()` rejects
 * any id outside `ROSTER_IDS` (`roster_incomplete` → the `unexpected` list).
 *
 * Fail closed (standard §4): if the roster breaks its own invariants the
 * endpoint serves 503 rather than advertising an authority model it cannot
 * honour. A caller that trusts this response to decide who may write text
 * must never receive a roster with two text writers.
 */

/** Bumped only when the response shape changes; the identities do not move. */
export const ROSTER_SCHEMA_VERSION = 1;

export interface RosterAgentView {
  /** Stable identifier — the key the pipeline, tests and docs all use. */
  id: string;
  name: string;
  group: string;
  purpose: string;
  /** Sorted, so the payload is byte-stable across calls. */
  writes: AgentWrite[];
  inTurnLoop: boolean;
  clientFacing: boolean;
  canVeto: boolean;
  canSelect: boolean;
  maySignalSeverity: boolean;
}

export interface RosterResponse {
  schemaVersion: number;
  count: number;
  agents: RosterAgentView[];
}

/**
 * Pure projection, exported so the mapping is testable without an HTTP server
 * and so a test can feed it a deliberately broken roster.
 */
export function buildRosterResponse(roster: readonly AgentSpec[] = ROSTER): RosterResponse {
  const agents = roster.map((spec) => ({
    id: spec.id,
    name: spec.name,
    group: spec.group,
    purpose: spec.purpose,
    writes: [...spec.writes].sort(),
    inTurnLoop: spec.inTurnLoop,
    clientFacing: spec.clientFacing,
    canVeto: spec.canVeto,
    canSelect: spec.canSelect,
    maySignalSeverity: spec.maySignalSeverity,
  }));
  return { schemaVersion: ROSTER_SCHEMA_VERSION, count: agents.length, agents };
}

export interface AgentsRouteOptions {
  /**
   * Overridable only so tests can prove the fail-closed branch against the real
   * handler. Production registration passes no options, so this is `ROSTER`.
   */
  roster?: readonly AgentSpec[];
}

const agentSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    group: { type: 'string' },
    purpose: { type: 'string' },
    writes: { type: 'array', items: { type: 'string' } },
    inTurnLoop: { type: 'boolean' },
    clientFacing: { type: 'boolean' },
    canVeto: { type: 'boolean' },
    canSelect: { type: 'boolean' },
    maySignalSeverity: { type: 'boolean' },
  },
} as const;

export async function agentsRoute(
  app: FastifyInstance,
  options: AgentsRouteOptions = {},
): Promise<void> {
  const roster = options.roster ?? ROSTER;

  app.get('/agents/roster', {
    // Same gate as every other non-health route: internal metadata, but the
    // deployed API has no anonymous surface apart from the health probe.
    preHandler: [verifyCognitoJWT],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            schemaVersion: { type: 'number' },
            count: { type: 'number' },
            agents: { type: 'array', items: agentSchema },
          },
        },
        503: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                violations: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      const violations = validateRoster(roster);
      if (violations.length > 0) {
        app.log.error(
          {
            reason: 'roster_invalid',
            violations: violations.map((v) => v.code),
          },
          'agents roster endpoint refusing to serve an invalid roster',
        );
        return reply.status(503).send({
          error: {
            code: 'ROSTER_INVALID',
            message: 'The agent roster fails its own authority rules; refusing to serve it.',
            violations: violations.map((v) => v.code),
          },
        });
      }

      return reply.send(buildRosterResponse(roster));
    },
  });
}
