-- E16 / E16-S5+E16-S9 unblock: assign ONE therapist to ONE client and seed a
-- short, clearly-synthetic transcript so the portal's caseload, client detail
-- and conversation views all have real rows to render.
--
-- Idempotent: every row carries a fixed id and uses ON CONFLICT DO NOTHING, so
-- running it twice changes nothing. Run via
--   scripts/in-vpc-db-task.sh --sql-file scripts/seed-client-demo.sql
-- (RDS is in a private subnet; there is no VPN or bastion.)
--
-- Two deliberate choices, both to keep this fixture honest:
--
--   1. No ClinicalConfig row. A care plan (CP1/CP2/CP3) is a clinical
--      assignment, not test data, so the client is left genuinely
--      "care plan unassigned" and the portal renders that state.
--   2. Seeded assistant turns carry model_version = NULL. Nothing in the
--      schema distinguishes a fixture from model output, so the one honest
--      marker available is left empty: NULL already means "no model call
--      produced this", and that is exactly true here.
--
-- The client is whichever non-deleted User owns the pre-existing real session
-- (created by the live Qwen turn during E17 work), and the therapist is the
-- seed account named below. Both are resolved by query, never by hardcoded id.

BEGIN;

-- 1. The assignment. activated_at is derived, not invented: it is the client's
--    own first session start, which is the same signal the mobile app sets it
--    from (markClientActivatedIfNeeded). chat_access_requested_at stays NULL —
--    the therapist requests access through the real portal mutation, which is
--    the behaviour E16-S9 is supposed to exercise.
INSERT INTO "TherapistClient"
  (id, therapist_id, client_user_id, created_at, chat_access_granted, activated_at, ended_at)
SELECT
  'b16c0000-0000-4000-8000-0000000000a0',
  th.id,
  u.id,
  now(),
  false,
  s.first_start,
  NULL
FROM "Therapist" th
CROSS JOIN LATERAL (
  SELECT sl.user_id AS id, min(sl.session_started_at) AS first_start
  FROM "SessionLog" sl
  JOIN "User" usr ON usr.id = sl.user_id AND usr.deleted_at IS NULL
  GROUP BY sl.user_id
  ORDER BY min(sl.session_started_at)
  LIMIT 1
) s
JOIN "User" u ON u.id = s.id
WHERE th.email = 'ananya.rao@okuvu.in'
ON CONFLICT DO NOTHING;

-- 2. Session B — four days ago, three exchanges.
INSERT INTO "SessionLog"
  (id, user_id, session_started_at, session_ended_at, turn_count, crisis_flag_detected)
SELECT
  'b16c0000-0000-4000-8000-0000000000b1',
  tc.client_user_id,
  now() - interval '4 days',
  now() - interval '4 days' + interval '11 minutes',
  3,
  false
FROM "TherapistClient" tc
WHERE tc.id = 'b16c0000-0000-4000-8000-0000000000a0'
ON CONFLICT DO NOTHING;

INSERT INTO "Turn"
  (id, session_id, user_id, turn_number, role, content, created_at,
   is_a9_fallback, taper_state, closure_offered, frustration_event,
   homework_referenced, therapist_referral)
SELECT
  v.id,
  'b16c0000-0000-4000-8000-0000000000b1',
  tc.client_user_id,
  v.turn_number,
  v.role,
  v.content,
  now() - interval '4 days' + ((v.turn_number - 1) * 3 || ' minutes')::interval,
  false, 'none', false, false, false, false
FROM "TherapistClient" tc
CROSS JOIN (VALUES
  ('b16c0000-0000-4000-8000-0000000001b1', 1, 'user',
   'I did the breathing thing before my review this morning. I still felt sick but I did not cancel.'),
  ('b16c0000-0000-4000-8000-0000000002b1', 1, 'assistant',
   'You went in even though it felt bad. What was the part that helped you walk through the door?'),
  ('b16c0000-0000-4000-8000-0000000003b1', 2, 'user',
   'Telling myself it was only twenty minutes. I kept checking the clock though.'),
  ('b16c0000-0000-4000-8000-0000000004b1', 2, 'assistant',
   'So the shorter frame made it possible, and the clock was how you kept yourself there. Was there a point where the checking eased off?'),
  ('b16c0000-0000-4000-8000-0000000005b1', 3, 'user',
   'About halfway. After that I was mostly listening.'),
  ('b16c0000-0000-4000-8000-0000000006b1', 3, 'assistant',
   'That is worth remembering for next time: the first half is the hard half, and it did pass. Do you want to try the same twenty-minute frame for the next one?')
) AS v(id, turn_number, role, content)
WHERE tc.id = 'b16c0000-0000-4000-8000-0000000000a0'
ON CONFLICT DO NOTHING;

-- 3. Session C — two days ago, one exchange. Two sessions so the conversation
--    view has a multi-session timeline rather than a single block.
INSERT INTO "SessionLog"
  (id, user_id, session_started_at, session_ended_at, turn_count, crisis_flag_detected)
SELECT
  'b16c0000-0000-4000-8000-0000000000c1',
  tc.client_user_id,
  now() - interval '2 days',
  now() - interval '2 days' + interval '6 minutes',
  1,
  false
FROM "TherapistClient" tc
WHERE tc.id = 'b16c0000-0000-4000-8000-0000000000a0'
ON CONFLICT DO NOTHING;

INSERT INTO "Turn"
  (id, session_id, user_id, turn_number, role, content, created_at,
   is_a9_fallback, taper_state, closure_offered, frustration_event,
   homework_referenced, therapist_referral)
SELECT
  v.id,
  'b16c0000-0000-4000-8000-0000000000c1',
  tc.client_user_id,
  v.turn_number,
  v.role,
  v.content,
  now() - interval '2 days' + ((v.turn_number - 1) * 3 || ' minutes')::interval,
  false, 'none', false, false, false, false
FROM "TherapistClient" tc
CROSS JOIN (VALUES
  ('b16c0000-0000-4000-8000-0000000007c1', 1, 'user',
   'Rough night. I did not sleep much and I skipped the walk.'),
  ('b16c0000-0000-4000-8000-0000000008c1', 1, 'assistant',
   'Skipping it after a bad night sounds like the night decided for you. Would a shorter version of the walk be possible today, or is rest the better call?')
) AS v(id, turn_number, role, content)
WHERE tc.id = 'b16c0000-0000-4000-8000-0000000000a0'
ON CONFLICT DO NOTHING;

COMMIT;

-- To remove this fixture entirely (nothing else references these rows):
--   DELETE FROM "TherapistNote" WHERE note_text LIKE 'E16-S5 smoke test note%';
--   DELETE FROM "Turn"      WHERE session_id IN
--     ('b16c0000-0000-4000-8000-0000000000b1','b16c0000-0000-4000-8000-0000000000c1');
--   DELETE FROM "SessionLog" WHERE id IN
--     ('b16c0000-0000-4000-8000-0000000000b1','b16c0000-0000-4000-8000-0000000000c1');
--   DELETE FROM "TherapistClient" WHERE id = 'b16c0000-0000-4000-8000-0000000000a0';
-- (Left in the file deliberately: a fixture nobody can cleanly remove is a
--  fixture that quietly becomes permanent.)
