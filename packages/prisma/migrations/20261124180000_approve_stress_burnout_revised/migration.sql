-- The owner approved these two Stress & Burnout worksheets after the
-- revisions he asked for, later on 24 November 2026: the Unsent letter
-- (letter helper, delete helper) and Weighing it up (what change is this,
-- four boxes about it, readiness helper).
--
-- GENERATED from packages/shared-types/worksheets by emit-sql.ts.
-- Do not hand-edit; regenerate instead.
--
-- The copy written here is the revised text he read and approved. The
-- previous migration left both rows `draft` with the pre-revision wording.

INSERT INTO "ToolRegistryEntry" ("id", "tool_id", "label", "label_hi", "text", "chat_guidable", "kind", "summary", "summary_hi", "section", "therapy_modality", "therapist_note", "access_mode", "load_level", "est_minutes", "content_en", "content_hi", "status", "approved_at", "sort_order", "library_group", "care_plans", "sensitive_check", "updated_at") VALUES
    ('c1b2a3d4-0000-4e00-9000-0000000003f0', 'ws_unsent_letter', 'Unsent letter', NULL, 'Write what was never said, then choose whether to keep it.', false, 'worksheet', 'Write what was never said, then choose whether to keep it.', NULL, 'people_boundaries', 'Expressive writing (unsent letter)', 'high load. Carries the deeper screen. The client chooses keep or delete at the end; delete removes the saved entry at once, and only the content-free flag stays.', 'assigned', 'demanding', 15, $ws_ws_unsent_letter${"version":1,"intro":"Some things never got said, and maybe they never will. Writing them down, with no plan to send them, can make a little more room inside you.","fields":[{"id":"to","type":"short_text","prompt":"Who is this letter to?","helper":"A name, a relationship, or just 'someone I used to know'. You don't have to explain."},{"id":"letter","type":"long_text","prompt":"Write the letter.","helper":"Nobody reads this unless you choose to share it. If something you write sounds like you might not be safe, OKUVU will check in with you and may let your therapist know."},{"id":"keep","type":"choice","prompt":"What would you like to do with it now?","required":true,"helper":"Keeping it saves it in Past me, private unless you share it later. Deleting removes it straight away.","options":[{"value":"keep","label":"Keep it privately"},{"value":"delete","label":"Delete it","description":"This deletes the letter. If OKUVU already checked in about something you wrote, your therapist may still know that a check-in happened."}]}],"closing":{"text":"You wrote it, and you decided what happens to it. Both of those are yours.","discardWhen":{"field":"keep","in":["delete"]}}}$ws_ws_unsent_letter$::jsonb, NULL, 'approved', '2026-11-24'::timestamp, 30, NULL, ARRAY['stress_burnout']::TEXT[], true, CURRENT_TIMESTAMP),
    ('c1b2a3d4-0000-4e00-9000-0000000003f1', 'ws_pros_cons_change', 'Weighing it up', NULL, 'Look at both sides of changing, and of staying the same.', false, 'worksheet', 'Look at both sides of changing, and of staying the same.', NULL, 'do_what_matters', 'Motivational interviewing: decisional balance', 'the four-quadrant decisional balance, plus a readiness rating. Values are read as the client''s own words; nothing is counted.', 'assigned', 'light', 10, $ws_ws_pros_cons_change${"version":1,"intro":"When part of you wants to change and part of you doesn't, that's not a flaw. It's worth looking at both sides slowly.","fields":[{"id":"change","type":"short_text","prompt":"What change are you thinking about?","required":true,"helper":"A sentence is enough. You can be as general or as specific as you like."},{"id":"good_changing","type":"long_text","prompt":"What might be good about this change?","helper":"Even small good things. Nothing is too obvious."},{"id":"good_same","type":"long_text","prompt":"What might be good about not making this change?","helper":"There's usually something, or it would be easier to change."},{"id":"cost_changing","type":"long_text","prompt":"What might this change cost you?","helper":"Time, comfort, people, the way things are now."},{"id":"cost_same","type":"long_text","prompt":"What might not making this change cost you?","helper":"It's alright if this is hard to answer. Take your time."},{"id":"ready","type":"scale_0_10","prompt":"How ready do you feel to change, right now?","helper":"There's no right number. Readiness can change from day to day.","minLabel":"0 = not at all","maxLabel":"10 = completely"},{"id":"noticed","type":"closing_reflection","prompt":"What do you notice, seeing all four side by side?","helper":"Optional."}],"closing":{"text":"Noticing both sides is not the same as staying stuck."}}$ws_ws_pros_cons_change$::jsonb, NULL, 'approved', '2026-11-24'::timestamp, 50, NULL, ARRAY['stress_burnout']::TEXT[], false, CURRENT_TIMESTAMP)
ON CONFLICT ("tool_id") DO UPDATE SET
    "label" = EXCLUDED."label",
    "label_hi" = EXCLUDED."label_hi",
    "kind" = EXCLUDED."kind",
    "summary" = EXCLUDED."summary",
    "summary_hi" = EXCLUDED."summary_hi",
    "section" = EXCLUDED."section",
    "therapy_modality" = EXCLUDED."therapy_modality",
    "therapist_note" = EXCLUDED."therapist_note",
    "access_mode" = EXCLUDED."access_mode",
    "load_level" = EXCLUDED."load_level",
    "est_minutes" = EXCLUDED."est_minutes",
    "content_en" = EXCLUDED."content_en",
    "content_hi" = EXCLUDED."content_hi",
    "status" = EXCLUDED."status",
    "approved_at" = EXCLUDED."approved_at",
    "sort_order" = EXCLUDED."sort_order",
    "library_group" = EXCLUDED."library_group",
    "care_plans" = EXCLUDED."care_plans",
    "sensitive_check" = EXCLUDED."sensitive_check",
    "updated_at" = CURRENT_TIMESTAMP;
