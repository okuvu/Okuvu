-- E16-S7 probe cleanup: remove the synthetic rows the deletion path left behind
-- (and the tombstone User row), so production returns to its pre-probe state.
-- Children first: every FK to "User" is ON DELETE RESTRICT.
DELETE FROM "TherapistNote"    WHERE client_user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "Homework"         WHERE client_user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "Appointment"      WHERE client_user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "ClinicalAccessLog" WHERE client_user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "InviteToken"      WHERE client_user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "TherapistClient"  WHERE client_user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "JournalEntry"     WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "Reminder"         WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "UserMemory"       WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM "User"             WHERE id = '11111111-1111-4111-8111-111111111111';
