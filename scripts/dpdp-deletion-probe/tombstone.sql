-- E16-S10 tombstone check: the row the deletion path retains must answer
-- "deleted?" without holding a single direct identifier.
-- Expected: email NULL, full_name NULL, date_of_birth NULL, gender NULL,
-- phone_number '' , auth_subject LIKE 'deleted-%', deleted_at NOT NULL.
WITH p AS (SELECT '11111111-1111-4111-8111-111111111111'::text AS uid)
SELECT
  count(*)                                                   AS tombstone_rows,
  count(*) FILTER (WHERE email IS NULL)                      AS email_null,
  count(*) FILTER (WHERE full_name IS NULL)                   AS full_name_null,
  count(*) FILTER (WHERE date_of_birth IS NULL)               AS dob_null,
  count(*) FILTER (WHERE gender IS NULL)                      AS gender_null,
  count(*) FILTER (WHERE phone_number = '')                   AS phone_blank,
  count(*) FILTER (WHERE auth_subject LIKE 'deleted-%')       AS auth_subject_replaced,
  count(*) FILTER (WHERE deleted_at IS NOT NULL)              AS deleted_at_stamped,
  count(*) FILTER (WHERE email IS NOT NULL OR full_name IS NOT NULL) AS pii_rows
FROM "User"
WHERE id = (SELECT uid FROM p);
