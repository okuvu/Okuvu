-- Row census for the E16-S7 deletion probe: rows belonging to the synthetic
-- client vs. total rows in each table that carries a FK to "User".
WITH p AS (SELECT '11111111-1111-4111-8111-111111111111'::text AS uid)
SELECT 'User' AS tbl, count(*) FILTER (WHERE id = (SELECT uid FROM p)) AS probe_rows, count(*) AS total_rows FROM "User"
UNION ALL SELECT 'EmergencyContact', count(*) FILTER (WHERE user_id = (SELECT uid FROM p)), count(*) FROM "EmergencyContact"
UNION ALL SELECT 'EngagementProfile', count(*) FILTER (WHERE user_id = (SELECT uid FROM p)), count(*) FROM "EngagementProfile"
UNION ALL SELECT 'ClinicalConfig', count(*) FILTER (WHERE user_id = (SELECT uid FROM p)), count(*) FROM "ClinicalConfig"
UNION ALL SELECT 'SafetyState', count(*) FILTER (WHERE user_id = (SELECT uid FROM p)), count(*) FROM "SafetyState"
UNION ALL SELECT 'Turn', count(*) FILTER (WHERE user_id = (SELECT uid FROM p)), count(*) FROM "Turn"
UNION ALL SELECT 'SessionSummary', count(*) FILTER (WHERE user_id = (SELECT uid FROM p)), count(*) FROM "SessionSummary"
UNION ALL SELECT 'MoodLog', count(*) FILTER (WHERE user_id = (SELECT uid FROM p)), count(*) FROM "MoodLog"
UNION ALL SELECT 'SessionLog', count(*) FILTER (WHERE user_id = (SELECT uid FROM p)), count(*) FROM "SessionLog"
UNION ALL SELECT 'JournalEntry', count(*) FILTER (WHERE user_id = (SELECT uid FROM p)), count(*) FROM "JournalEntry"
UNION ALL SELECT 'TherapistNote', count(*) FILTER (WHERE client_user_id = (SELECT uid FROM p)), count(*) FROM "TherapistNote"
UNION ALL SELECT 'Homework', count(*) FILTER (WHERE client_user_id = (SELECT uid FROM p)), count(*) FROM "Homework"
UNION ALL SELECT 'Reminder', count(*) FILTER (WHERE user_id = (SELECT uid FROM p)), count(*) FROM "Reminder"
UNION ALL SELECT 'Appointment', count(*) FILTER (WHERE client_user_id = (SELECT uid FROM p)), count(*) FROM "Appointment"
UNION ALL SELECT 'ClinicalAccessLog', count(*) FILTER (WHERE client_user_id = (SELECT uid FROM p)), count(*) FROM "ClinicalAccessLog"
UNION ALL SELECT 'TherapistClient', count(*) FILTER (WHERE client_user_id = (SELECT uid FROM p)), count(*) FROM "TherapistClient"
UNION ALL SELECT 'UserMemory', count(*) FILTER (WHERE user_id = (SELECT uid FROM p)), count(*) FROM "UserMemory"
UNION ALL SELECT 'InviteToken', count(*) FILTER (WHERE client_user_id = (SELECT uid FROM p)), count(*) FROM "InviteToken"
UNION ALL SELECT 'Therapist(seed)', 0, count(*) FROM "Therapist"
ORDER BY 1
