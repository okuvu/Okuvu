-- E16-S7 deletion-path probe: synthetic client, created only to be deleted.
-- Every value here is fabricated; nothing refers to a real person.
INSERT INTO "User" (id, auth_subject, phone_number, email, full_name, created_at, updated_at)
VALUES ('11111111-1111-4111-8111-111111111111', '@@SUB@@', '+919000000001',
        'e16s7.deletion.probe@example.test', 'E16S7 Deletion Probe',
        now(), now());
INSERT INTO "SessionLog" (id, user_id, session_started_at, session_ended_at, turn_count)
VALUES ('11111111-1111-4111-8111-111111111112', '11111111-1111-4111-8111-111111111111',
        now() - interval '2 hours', now() - interval '1 hour', 2);
INSERT INTO "Turn" (id, session_id, user_id, turn_number, role, content)
VALUES ('11111111-1111-4111-8111-111111111113', '11111111-1111-4111-8111-111111111112',
        '11111111-1111-4111-8111-111111111111', 1, 'user', 'SYNTHETIC probe turn 1 (E16-S7)'),
       ('11111111-1111-4111-8111-111111111114', '11111111-1111-4111-8111-111111111112',
        '11111111-1111-4111-8111-111111111111', 2, 'assistant', 'SYNTHETIC probe turn 2 (E16-S7)');
INSERT INTO "SessionSummary" (id, user_id, session_id, summary_text, last_updated_turn, last_updated_at)
VALUES ('11111111-1111-4111-8111-111111111115', '11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111112', 'SYNTHETIC probe summary (E16-S7)', 2, now());
INSERT INTO "MoodLog" (id, user_id, mood_value, date_ist, updated_at)
VALUES ('11111111-1111-4111-8111-111111111116', '11111111-1111-4111-8111-111111111111',
        3, current_date, now());
INSERT INTO "JournalEntry" (id, user_id, emotion, intensity, content)
VALUES ('11111111-1111-4111-8111-111111111117', '11111111-1111-4111-8111-111111111111',
        'anxious', 4, 'SYNTHETIC probe journal body (E16-S7)');
INSERT INTO "EmergencyContact" (id, user_id, encrypted_name, encrypted_phone)
VALUES ('11111111-1111-4111-8111-111111111118', '11111111-1111-4111-8111-111111111111',
        'SYNTHETIC-ENC-NAME', 'SYNTHETIC-ENC-PHONE');
INSERT INTO "EngagementProfile" (id, user_id)
VALUES ('11111111-1111-4111-8111-111111111119', '11111111-1111-4111-8111-111111111111');
INSERT INTO "ClinicalConfig" (id, user_id, care_plan_id)
VALUES ('11111111-1111-4111-8111-11111111111a', '11111111-1111-4111-8111-111111111111', 'CP1');
INSERT INTO "SafetyState" (id, user_id, safety_state_current, updated_at)
VALUES ('11111111-1111-4111-8111-11111111111b', '11111111-1111-4111-8111-111111111111', 'S0', now());
INSERT INTO "TherapistClient" (id, therapist_id, client_user_id)
SELECT '11111111-1111-4111-8111-11111111111c', id, '11111111-1111-4111-8111-111111111111'
FROM "Therapist" WHERE email = 'ananya.rao@okuvu.in';
INSERT INTO "TherapistNote" (id, therapist_id, client_user_id, note_text)
SELECT '11111111-1111-4111-8111-11111111111d', id, '11111111-1111-4111-8111-111111111111',
       'SYNTHETIC probe therapist note (E16-S7)'
FROM "Therapist" WHERE email = 'ananya.rao@okuvu.in';
INSERT INTO "Homework" (id, client_user_id, therapist_id, description, updated_at)
SELECT '11111111-1111-4111-8111-11111111111e', '11111111-1111-4111-8111-111111111111', id,
       'SYNTHETIC probe homework (E16-S7)', now()
FROM "Therapist" WHERE email = 'ananya.rao@okuvu.in';
INSERT INTO "Reminder" (id, user_id, schedule_note)
VALUES ('11111111-1111-4111-8111-11111111111f', '11111111-1111-4111-8111-111111111111',
        'SYNTHETIC probe reminder (E16-S7)');
INSERT INTO "Appointment" (id, therapist_id, client_user_id, scheduled_at, mode, updated_at)
SELECT '11111111-1111-4111-8111-111111111120', id, '11111111-1111-4111-8111-111111111111',
       now() + interval '1 day', 'video', now()
FROM "Therapist" WHERE email = 'ananya.rao@okuvu.in';
INSERT INTO "ClinicalAccessLog" (id, therapist_id, client_user_id, action)
SELECT '11111111-1111-4111-8111-111111111121', id, '11111111-1111-4111-8111-111111111111',
       'view_summary'
FROM "Therapist" WHERE email = 'ananya.rao@okuvu.in';
INSERT INTO "UserMemory" (id, user_id, last_updated)
VALUES ('11111111-1111-4111-8111-111111111122', '11111111-1111-4111-8111-111111111111', now());
INSERT INTO "InviteToken" (id, token_hash, therapist_id, client_user_id, expires_at)
SELECT '11111111-1111-4111-8111-111111111123', repeat('e16s7probe', 4), id,
       '11111111-1111-4111-8111-111111111111', now() + interval '7 days'
FROM "Therapist" WHERE email = 'ananya.rao@okuvu.in';
