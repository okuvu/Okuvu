-- Probe cleanup: remove every synthetic row the probe created (and the tombstone
-- User row), so production returns to its exact pre-probe state.
-- Children first: without the E16-S10 migration every FK to "User" is ON DELETE
-- RESTRICT, so this file must not rely on cascades. Written to be safe under
-- either state (CASCADE or RESTRICT).
--
-- Every statement is scoped to the fixed probe id / probe session id / probe
-- email. There is no TRUNCATE and no unscoped DELETE anywhere in this directory.
DELETE FROM "GovernanceLog"     WHERE session_id = '11111111-1111-4111-8111-111111111112';
DELETE FROM "Reminder"          WHERE user_id = '11111111-1111-4111-8111-111111111111'
                                   OR homework_id IN (SELECT id FROM "Homework"
                                                      WHERE client_user_id = '11111111-1111-4111-8111-111111111111');
DELETE FROM "UserToolPreference" WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "TherapistNote"     WHERE client_user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "Homework"          WHERE client_user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "Appointment"       WHERE client_user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "ClinicalAccessLog" WHERE client_user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "InviteToken"       WHERE client_user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "TherapistClient"   WHERE client_user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "Turn"              WHERE user_id = '11111111-1111-4111-8111-111111111111'
                                   OR session_id = '11111111-1111-4111-8111-111111111112';
DELETE FROM "SessionSummary"    WHERE user_id = '11111111-1111-4111-8111-111111111111'
                                   OR session_id = '11111111-1111-4111-8111-111111111112';
DELETE FROM "SessionLog"        WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "JournalEntry"      WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "MoodLog"           WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "EmergencyContact"  WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "EngagementProfile" WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "ClinicalConfig"    WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "SafetyState"       WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "UserMemory"        WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "BetaConsent"       WHERE user_ref = '11111111-1111-4111-8111-111111111111';
DELETE FROM "WaitlistEntry"     WHERE email = 'e16s7.deletion.probe@example.test'
                                   AND phone_number = '+919000000001';
DELETE FROM "User"              WHERE id = '11111111-1111-4111-8111-111111111111';
