-- Dr Goswami's approved v2.0.0 set (3 Nov 2026): Guided breathing and Extended
-- exhale were "essentially the same exercise", so the fourth technique becomes
-- Humming breath (bhramari). Box, sigh and extended keep their ids so existing
-- Homework rows and UserToolPreference rows still resolve.

INSERT INTO "ToolRegistryEntry" ("id", "tool_id", "label", "text", "chat_guidable") VALUES
    ('a1e6f8b2-0a4c-4b3e-9f1d-2c3d4e5f6006', 'humming_breath', 'Humming Breath', 'Humming breath — breathe in through your nose, then breathe out with a soft, steady hum, lips gently closed.', true);

-- The canonical one-line copy follows her wording, so the therapist-assigned
-- line and the in-app explanation cannot describe different breaths.
UPDATE "ToolRegistryEntry" SET "text" = 'Physiological sigh — a deep breath in through the nose until your lungs feel full, a small extra sip of air on top, then one long sigh out through the mouth.' WHERE "tool_id" = 'physiological_sigh';
UPDATE "ToolRegistryEntry" SET "text" = 'Extended exhale — breathe in through your nose for 4, then out slowly for 8. No hold.' WHERE "tool_id" = 'extended_exhale';
