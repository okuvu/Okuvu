import type { TestAgentId } from '@evia/shared-types';

export type SchemaFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | `enum:${string}`
  | 'json';

export interface AgentSchemaField {
  name: string;
  type: SchemaFieldType;
  required: boolean;
  description?: string;
}

export interface AgentSchema {
  agentId: TestAgentId;
  fields: AgentSchemaField[];
}

/**
 * Hand-written lookup table describing each agent's expected input shape,
 * for the test-harness UI to render a dynamic form. Not a full JSON-schema
 * integration — per TH-S09 scope, this only needs to be fully functional
 * for A2; the others can be simpler/shorter.
 */
const AGENT_SCHEMAS: Record<TestAgentId, AgentSchemaField[]> = {
  A1: [
    { name: 'message', type: 'string', required: true },
    { name: 'recentHistory', type: 'json', required: false, description: '[{ role: "user"|"assistant", content: string }]' },
  ],
  'A9-pre': [
    { name: 'userId', type: 'string', required: false, description: 'Defaults to mock test-user' },
    { name: 'message', type: 'string', required: true },
  ],
  A8: [
    { name: 'safety_state', type: 'enum:S0,S1,S2,S3,S4', required: false },
    { name: 'governance_state', type: 'enum:Active,Restricted,Blocked', required: false },
    { name: 'session_count', type: 'number', required: false },
    { name: 'turn_count', type: 'number', required: false },
  ],
  A2: [
    { name: 'userId', type: 'string', required: false, description: 'Defaults to mock test-user' },
    { name: 'message', type: 'string', required: true },
    { name: 'carePlan', type: 'enum:CP1,CP2,CP3', required: true },
    { name: 'safetyState', type: 'enum:S0,S1,S2', required: true },
    { name: 'sessionNumber', type: 'number', required: true },
    { name: 'turnNumber', type: 'number', required: true },
    { name: 'sessionHistorySummary', type: 'string', required: false },
    { name: 'perceivedIntensity', type: 'number', required: false },
    { name: 'mode', type: 'enum:normal,grounding-only,alliance-building', required: true },
    { name: 'recentHistory', type: 'json', required: false, description: '[{ role: "user"|"assistant", content: string }]' },
    { name: 'sessionSummary', type: 'string', required: false },
    { name: 'toolResultContext', type: 'string', required: false },
    { name: 'userMemoryContext', type: 'string', required: false },
    { name: 'retrievedContext', type: 'string', required: false },
  ],
  'A9-post': [
    { name: 'userContent', type: 'string', required: true, description: "The A2 draft response to review — defaults to the mock context's message" },
    { name: 'safetyState', type: 'enum:S0,S1,S2,S3,S4', required: false },
    { name: 'carePlan', type: 'enum:CP1,CP2,CP3', required: false },
  ],
  A10A: [
    { name: 'note', type: 'string', required: false, description: 'A10A is out of scope for TH-S09' },
  ],
  A13: [
    { name: 'sessionId', type: 'string', required: false, description: 'Defaults to a synthetic test-harness session id' },
    { name: 'userId', type: 'string', required: false, description: 'Defaults to mock test-user' },
  ],
  A15: [
    { name: 'sessionId', type: 'string', required: false, description: 'Defaults to a synthetic test-harness session id' },
    { name: 'userId', type: 'string', required: false, description: 'Defaults to mock test-user' },
  ],
};

export function getAgentSchema(agentId: TestAgentId): AgentSchema {
  return { agentId, fields: AGENT_SCHEMAS[agentId] };
}
