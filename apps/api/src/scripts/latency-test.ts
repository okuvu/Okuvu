import { processTurn } from '../pipeline/orchestrator.js';
import { prisma } from '../lib/prisma.js';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../../.env') });

const TEST_UID = 'latency-test-user';
const TEST_SESSION_ID = 'latency-test-session';

async function setup(): Promise<void> {
  await prisma.user.upsert({
    where: { firebase_uid: TEST_UID },
    update: {},
    create: {
      id: TEST_UID,
      firebase_uid: TEST_UID,
      phone_number: '+910000000000',
    },
  });

  await prisma.sessionLog.create({
    data: {
      id: TEST_SESSION_ID,
      user_id: TEST_UID,
      turn_count: 0,
    },
  }).catch(() => {});
}

async function run(): Promise<void> {
  await setup().catch(() => {});

  const messages = [
    'I had a rough day at work today',
    'Feeling a bit anxious about tomorrow',
    'I tried the breathing exercise you suggested',
    'My sleep has been better this week',
    'I feel like I am making progress',
    'Had a disagreement with my partner',
    'The grounding technique helped with my panic',
    'I am worried about my presentation',
    'I felt proud of myself for handling a difficult situation',
    'I am grateful for this conversation',
    'I have been feeling lonely lately',
    'The mindfulness exercise was helpful',
    'I am struggling with motivation',
    'I had a good therapy session today',
    'I feel stuck in my current routine',
    'I am trying to be more patient with myself',
    'The weather has been affecting my mood',
    'I reconnected with an old friend',
    'I am learning to accept my emotions',
    'I set a small goal and achieved it',
    'I felt overwhelmed at the grocery store',
    'I am practicing self-compassion',
    'I had a nightmare last night',
    'I am proud of myself for reaching out',
    'I want to work on my communication skills',
  ];

  const latencies: number[] = [];

  for (let i = 0; i < messages.length; i++) {
    const start = performance.now();
    const result = await processTurn(TEST_UID, TEST_SESSION_ID, messages[i]);
    const elapsed = performance.now() - start;
    latencies.push(elapsed);

    const typeStr = result.type === 'agent_turn' ? 'agent_turn' : result.type;
    const fallback = result.type === 'agent_turn' ? result.fallbackUsed : false;
    console.log(`Turn ${i + 1}: ${Math.round(elapsed)}ms | type=${typeStr} | fallback=${fallback}`);
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  console.log('\n--- Latency Results ---');
  console.log(`Total turns: ${latencies.length}`);
  console.log(`p50: ${Math.round(p50)}ms`);
  console.log(`p95: ${Math.round(p95)}ms`);
  console.log(`p99: ${Math.round(p99)}ms`);
  console.log(`Average: ${Math.round(avg)}ms`);
  console.log(`Min: ${Math.round(latencies[0])}ms`);
  console.log(`Max: ${Math.round(latencies[latencies.length - 1])}ms`);
  console.log(`Target < 2000ms p50: ${p50 < 2000 ? 'PASS' : 'FAIL'}`);

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error('Latency test failed:', err);
  process.exit(1);
});
