-- okuvu-remaining-changes.md O7: CrisisResource was seeded with only iCall +
-- Vandrevala (the 2 numbers A9-post's prompt already treated as approved),
-- while apps/mobile's crisis_overlay.dart has shipped all 5 of these numbers
-- since before this table existed. This is not new content — it's copying
-- what's already live in production onto the single source of truth, so
-- CrisisResource, A9-post's prompt, and the app's hardcoded list all agree.
-- The mobile app's own rendering stays hardcoded/offline-safe; it is not
-- rewired to read from this table (see docs/verification/E6-S04-crisis-
-- screen-offline.md's offline-must-work requirement).
INSERT INTO "CrisisResource" ("id", "name", "phone", "order") VALUES
    ('b2f7a9c3-1b5d-4c4f-8e2a-3d4e5f6a7003', 'NIMHANS', '080-46110007', 2),
    ('b2f7a9c3-1b5d-4c4f-8e2a-3d4e5f6a7004', 'Snehi', '044-24640050', 3),
    ('b2f7a9c3-1b5d-4c4f-8e2a-3d4e5f6a7005', 'Emergency Services', '112', 4);
