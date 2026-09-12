# Tool-ID Registry — status doc

**Written** 12 Sep 2026 · resolves the "tools-inventory-v0.1 → tool-id registry" gap flagged in `00-doc-map-and-parity-resolutions.md` §B.3 (`okuvu-remaining-changes.md` §F.3).

## What this replaces

`tools-inventory-v0.1.md`'s "chat parity" column still referenced dead `T1–T8` codes. §B.3 called for a real tool-id registry — a single canonical list of tool ids shared by A2's prompt (`${toolkit}`, S-07's `tool_launched`), the app's tool cards, `buildToolCard`/`tool-result-store` in the API, and the harness's corpus fields — replacing the T1–T8 scheme entirely.

## Current state: schema exists, seeded with 3 tools, full list still pending clinical review

**`ToolRegistryEntry`** (`packages/prisma/schema.prisma`):

```prisma
model ToolRegistryEntry {
  id            String     @id @default(uuid())
  tool_id       String     @unique
  label         String
  chat_guidable Boolean    @default(true)
  created_at    DateTime   @default(now())
  reminders     Reminder[]
}
```

Seeded rows (migration `20260910130000_add_homework_reminder_language_mode_registries`), matching exactly what's already live in `apps/api/src/lib/tool-card.ts`:

| `tool_id` | `label` | `chat_guidable` |
|---|---|---|
| `grounding_5431` | 5-4-3-2-1 Grounding | true |
| `guided_breathing` | Guided Breathing | true |
| `box_breathing` | Box Breathing | true |

The seed migration's own comment is explicit: *"only the 3 ids already live in `apps/api/src/lib/tool-card.ts` — the full proposed list is pending clinical review, not invented here."* This doc doesn't change that — no new tool ids are added below.

## What consumes the registry today

- **`Reminder.tool_id`** (§D, `20260911170000_add_reminder_frequency_tool_link`) — a reminder can optionally reference one of these 3 tools via FK to `ToolRegistryEntry.tool_id`. The therapist-portal's `/clients/[id]/reminders` page's tool dropdown is populated from `reminders.listTools`, which reads this table directly — so a 4th tool added here would appear in that dropdown with zero further code changes.
- **`apps/api/src/pipeline/orchestrator.ts`**'s `KNOWN_TOOL_CARD_TYPES` — a parallel, code-level set of the same 3 ids, used to decide whether A2's `tool_launched` signal maps to a real in-app tool card (`isKnownToolCardType`/`buildToolCard`). This is **not yet read from `ToolRegistryEntry`** — it's a separate hardcoded `Set` in `orchestrator.ts:21`. Keeping these two lists in sync by hand is the actual remaining engineering risk once the registry grows past 3.
- **`apps/api/src/routes/websocket.ts`**'s `TOOL_RESULT` handler only accepts `grounding_5431` — confirmed correct by design, not a gap: `guided_breathing`/`box_breathing` are pure client-side timers (mobile's `GuidedBreathingCard`) with nothing to submit back over the websocket. See the investigation in commit `028a794`.

## The gap between this list and the doc-map's original proposal

`00-doc-map-and-parity-resolutions.md` §B.3 proposed a longer candidate list: `grounding_5431, box_breathing, physiological_sigh, extended_exhale, breathing_478, urge_surfing, opposite_action, check_the_facts, please_check, emotion_naming, one_small_thing, …`. Two things are worth flagging honestly:

1. **`guided_breathing`** — the tool actually shipped in code and seeded here — **does not appear in that proposed list at all**. It predates this registry (it's the mobile app's original breathing exercise, from before the v2.0 tool-id concept existed) and was carried over as one of the "already live" ids rather than reconciled against the doc's proposal.
2. None of the other 9 proposed ids (`physiological_sigh`, `extended_exhale`, `breathing_478`, `urge_surfing`, `opposite_action`, `check_the_facts`, `please_check`, `emotion_naming`, `one_small_thing`) exist in code, in the registry, or anywhere else — they are unimplemented proposals, not a backlog with partial progress.

## What's still open (not resolved by this doc)

- **The final tool-id list itself** — adding any of the 9 proposed-but-unbuilt ids (or reconciling `guided_breathing` against the proposal) needs the clinical review this doc-map entry always said it needed ("Shubhangi review — still pending," §B.3 item 3). Not an engineering decision.
- **A2-guidable vs. app-card-only split** — `chat_guidable` exists as a column and defaults to `true` for all 3 current tools, but no one has actually reviewed whether that's correct per-tool; it's a placeholder default, not a reviewed classification.
- **Per-tool default reminder frequency/schedule** — §B.3 item 4 ("frequency/schedule defaults per tool feed the reminder scheduler") is unimplemented. `Reminder.frequency`/`Reminder.times` (§D) are always therapist-set manually today; nothing pre-fills them based on which tool is attached.
- **Reconciling `orchestrator.ts`'s `KNOWN_TOOL_CARD_TYPES`** with this table so there's one source of truth instead of two hardcoded lists that happen to currently agree.
