# Evia Mobile App — Design.md

**For: AI coding agents (Claude Code, Cursor) implementing the Flutter client**
**Tagline: "A space that listens."**
**Scope: Verified MVP only — see Section 0 before building anything.**

---

## 0. Read This First — MVP Scope Discipline

Evia's full architecture spec (15 agents, 10 care paths, 6 languages, two pricing tiers) is **not** what you are building. Build to the verified MVP below. Where a screen or component has a "Full Architecture (not MVP)" note, treat it as reference only — do not wire it, do not scaffold empty states for it, do not leave placeholder nav items pointing at it unless explicitly asked.

**Verified MVP scope:**
- One therapeutic agent live: **A2 (Emotion Regulation)**. No A3–A8 routing yet.
- **4-gate safety routing**: Gate 1 (S0–S1, normal), Gate 2 (S2, restricted techniques), Gate 3 (S3, therapeutic blocked), Gate 4 (S4, hardcoded crisis overlay).
- **3 care plans only**: CP1 Anxiety, CP2 Depression, CP3 Stress/Burnout.
- **3-turn onboarding intake** (not the 8-turn flow described in the full PRD).
- **English only.** No language selection screen, no script-mode toggle, no code-switch UI.
- **On-device TTS** via `flutter_tts` (Android). Not Sarvam Bulbul, not cloud voice.
- **SRS-only measurement**: a single 1–4 Session Rating Scale at session close. No multi-parameter A14 assessment engine.

If you are asked to build a screen not listed as MVP below, flag it back rather than silently implementing the full-architecture version.

---

## 1. Product Context & Design Principles

Evia is a between-session mental wellness companion for Indian Gen Z and millennials (18–30) — mobile-first, urban/semi-urban, comfortable with English but stigma-adjacent about therapy itself. The product should feel as familiar and low-friction as WhatsApp, with clinical depth operating quietly underneath. It is **not** a clinical or diagnostic tool, and nothing in the UI should imply otherwise.

**Five working principles:**

1. **Calm over clever.** No UI element should compete for attention with what the user is trying to say. Motion is slow and settling, never bouncy or celebratory-by-default.
2. **Never clinical-cold, never performatively cute.** Warm, plain, human language. No emoji-stuffed cheerfulness, no diagnostic vocabulary.
3. **Safety is never decorative.** Crisis-related UI (Section 6.6) is the one place where clarity beats calm — high contrast, zero ambiguity, always reachable.
4. **Progress without pressure.** Streaks and check-ins encourage without guilt. A missed day is never framed as failure (see streak copy in Section 8).
5. **Restraint.** One signature motion idiom (Section 4.5) carries the brand. Everything else stays quiet so that idiom reads clearly.

---

## 2. Design Tokens

### 2.1 Color

| Token | Hex | Usage |
|---|---|---|
| `color.primary` | `#1A6B5A` | Primary teal. CTAs, active states, brand mark, chat agent bubble accent. |
| `color.primary.dark` | `#0F4A3D` | Pressed states, high-emphasis text on cream. |
| `color.primary.tint` | `#DCEEE9` | Selected chips, subtle highlight backgrounds. |
| `color.background` | `#F8F5F0` | App background (cream). Never pure white. |
| `color.surface` | `#FFFFFF` | Cards, sheets, modals sitting on the cream background. |
| `color.surface.muted` | `#F1EDE6` | Secondary card fill (e.g. inactive content cards). |
| `color.accent.warm` | `#E8A33D` | Marigold accent. Used **only** for delight moments — streak flame, milestone banners, insight-card highlight. Never for primary actions. |
| `color.text.primary` | `#20241F` | Body text on cream/white. |
| `color.text.secondary` | `#5B6259` | Captions, timestamps, helper text. |
| `color.text.inverse` | `#F8F5F0` | Text on primary/dark fills. |
| `color.border` | `#E4DFD5` | Hairline dividers, input borders. |
| `color.gate2.amber` | `#C97A1A` | Gate 2 (S2) inline notices — restricted technique, gentle caution. |
| `color.gate3.rust` | `#B5482E` | Gate 3 (S3) inline notices — therapeutic content paused. |
| `color.gate4.crisis` | `#8C1F1F` | Gate 4 (S4) crisis overlay only. Never used elsewhere — this color must read as unambiguous. |
| `color.success` | `#2F7A4D` | Confirmation states (rare — most confirmations are just text, not color). |

Do not introduce additional hues without a documented reason. Two accents (teal + marigold) plus three gate-severity colors is the full palette.

### 2.2 Typography

Two type families, used with restraint:

- **`font.display` — Fraunces** (soft-serif, warm, optically rounded). Used only for: the app wordmark, onboarding headlines, the A10 insight-card sentence, and empty-state headlines. Never for body copy or buttons. This is what gives Evia its "a space that listens" literary warmth instead of reading as generic chat-app software.
- **`font.ui` — Manrope** (rounded geometric sans). Everything else: chat bubbles, buttons, nav labels, form fields, captions. Use tabular figures for streak counts and timers.

| Style | Face | Size | Weight | Line height |
|---|---|---|---|---|
| Display / wordmark | Fraunces | 32sp | 500 | 1.2 |
| Headline (onboarding, insight card) | Fraunces | 22sp | 500 | 1.3 |
| Title (screen headers) | Manrope | 18sp | 700 | 1.3 |
| Body | Manrope | 16sp | 400 | 1.5 |
| Body — chat bubble | Manrope | 16sp | 400 | 1.45 |
| Caption / timestamp | Manrope | 13sp | 500 | 1.3 |
| Button label | Manrope | 15sp | 600 | 1.0 |

### 2.3 Spacing & Radius

8pt base grid: `4, 8, 12, 16, 24, 32, 48, 64`.

| Token | Value | Usage |
|---|---|---|
| `radius.sm` | 8 | Chips, inline badges. |
| `radius.md` | 16 | Cards, chat bubbles, buttons. |
| `radius.lg` | 24 | Bottom sheets, modals (top corners only). |
| `radius.full` | 999 | Avatar, mood-tap icons, FAB. |

### 2.4 Elevation

Evia uses almost no drop shadow — flat cards on the cream background feel calmer. Where separation is needed (modals, the crisis overlay, floating CTA), use a single soft shadow: `0px 4px 16px rgba(32,36,31,0.08)`. Never stack multiple shadow levels.

### 2.5 Motion — the signature idiom

**"Breathing," not "typing."** Every waiting/loading state in Evia (agent composing a reply, TTS generating, session opening) uses a slow scale-and-opacity pulse at **~4-second cycle** (2s inhale, 2s exhale) rather than bouncing dots or a spinner. This is deliberate: it paces the user's nervous system down instead of signaling urgency, and it's the one motion idiom that should feel unmistakably "Evia" across the whole app.

- Standard transitions: 200–250ms, ease-out.
- The breathing pulse: 4000ms, ease-in-out, infinite, respecting `prefers-reduced-motion` (fall back to a static three-dot glyph with 30% opacity, no animation).
- Never use bounce, spring-overshoot, or confetti/burst effects — even for streak milestones (see Section 8).

---

## 3. Component Library

### 3.1 Buttons
- **Primary** — `color.primary` fill, white text, `radius.md`, 48dp height, full-width on forms, intrinsic-width on cards.
- **Secondary** — 1.5dp `color.primary` stroke, `color.primary` text, transparent fill.
- **Text button** — no fill/stroke, `color.primary` text, used for "Not now" / "Skip" / tertiary actions.
- **Crisis button** (Section 6.6 only) — solid `color.gate4.crisis`, white text, always paired with a phone icon, minimum 56dp height (larger tap target — this is a high-stakes action).

### 3.2 Cards
- **Standard card** — `color.surface`, `radius.md`, 16dp padding, hairline `color.border` only if sitting directly against another surface (no border needed on cream background).
- **Insight card** (A-03 home) — `color.surface.muted` fill, Fraunces headline text, no icon, no border. Reads like a quiet note, not a notification.
- **Streak card** — small marigold flame glyph (the *only* place `color.accent.warm` appears as an icon fill), Manrope tabular numeral for day count.

### 3.3 Chat bubbles (A-04)
- **User bubble** — right-aligned, `color.primary.tint` fill, `color.text.primary` text, `radius.md` with the bottom-right corner squared (4dp) to indicate directionality — the one asymmetric-corner rule in the system.
- **Agent (A2) bubble** — left-aligned, `color.surface` fill, subtle 1dp `color.border`, bottom-left corner squared to mirror the user bubble rule.
- **Gate 2/3 inline notice** — not a bubble; a full-width thin banner between bubbles, left-bordered 3dp in `color.gate2.amber` or `color.gate3.rust`, plain-language text, no icon.
- **Agent composing state** — the breathing pulse (Section 2.5) inside a bubble-shaped container, same size as an average agent bubble so layout doesn't jump when the real reply arrives.
- **Voice toggle** — small icon button top-right of the chat app bar. Two states only: on (filled, `color.primary`) / off (outline, `color.text.secondary`). No intermediate "loading voice" spinner — use the breathing pulse on the speaker icon itself while `flutter_tts` buffers.

### 3.4 SRS modal (session close)
Single-screen modal, not a multi-step wizard. Fraunces headline: "How did that feel?" Four tap targets, 1–4, plain numeric with a one-word anchor under each (e.g. 1 "Not really" → 4 "Very much"). No slider, no star rating — four large equal-weight buttons, because the clinical instrument is ipsative and a slider implies false precision. Submits immediately on tap; no separate "Submit" button.

### 3.5 Crisis overlay (A-07)
See Section 6.6. This is the one screen where the design system's calm-and-quiet rules are intentionally suspended in favor of clarity and speed.

### 3.6 Bottom navigation
3 tabs only for MVP: **Home** · **Chat** · **Progress** (if Progress ships) or **Home · Chat · Settings** if Progress is deferred — confirm against current sprint scope before wiring a 3rd/4th tab. Do not add a Settings tab item for Language (English-only MVP) or Content Library (P2, not MVP).

---

## 4. Screens — MVP Build List

Each screen below is scoped to what's actually being built. Full-architecture detail from the PRD is noted only where it clarifies future direction — do not implement it now.

### 4.1 A-00 / A-00a — Splash & Auth
Splash: wordmark centered on cream, Fraunces, no tagline animation beyond a simple 400ms fade-in. Auth: phone number entry → OTP. Single input field, large numeric OTP boxes (6 digits), auto-advance focus, resend link appears after 30s countdown (shown as plain text countdown, not a spinner).

### 4.2 A-01 — Onboarding Consent
Four individually-checkable consent items (safety monitoring is non-optional and shown as always-checked/disabled; the other three are toggle switches, not checkboxes, since they're binary preferences the user may revisit in Settings). "Continue" button stays disabled until the user has scrolled to see all four items — don't gate on toggle state, gate on scroll-read.

### 4.3 A-02 — Intake (3-turn MVP)
Chat-shaped, not a form — reuses the A-04 chat bubble components so onboarding doesn't feel like a different app. 3 turns: presenting concern → brief follow-up → care plan confirmation screen (plain-language card: "It sounds like anxiety has been showing up a lot — we'll start there. You can always adjust this later.") with an "Actually, something else" text link that reopens the picker (CP1/CP2/CP3 only).

### 4.4 A-03 — Home
- Daily micro check-in card at top: "How are you today?" 5 tap targets (mood 1–5), single tap = done, resets midnight IST, hidden if a full session already happened today or if Gate 3/4 is active (crisis screen takes precedence — never stack the check-in card over it).
- A10 insight card below (Fraunces headline sentence, `color.surface.muted`), shown at most once every 3 days, hidden until ≥3 sessions of history exist.
- Streak card.
- Large "Check in" primary CTA below the fold — always visible, never obscured by the two cards above it.

### 4.5 A-04 — Chat
Core screen. WebSocket-driven turn loop. Render Gate 1 (normal) as standard bubbles; Gate 2 as an inline amber notice before the relevant agent bubble; Gate 3 as a rust notice replacing the composer with a "Let's pause here" state and a link to grounding content; Gate 4 immediately opens the crisis overlay (Section 6.6) full-screen, non-dismissable, regardless of what else is on screen. SRS modal (3.4) appears automatically on session close, not on a button press.

### 4.6 A-05 — Progress *(confirm P0/P1 status against current sprint before building)*
Care-phase label in plain language ("Getting to know each other" / "Building tools" / "Practising" / "Settling in" / "Maintaining"), a simple line chart of the last 14 SRS scores (not a full mood-trend system), streak history. No "improving/declining" framing — the chart shows the numbers, not a verdict.

### 4.7 A-06 — Settings (MVP subset)
My Focus (shows assigned care plan, read-only for MVP), Emergency Contact, Privacy & Consent (toggles from A-01, revisitable). **Omit** Language Selection entirely for MVP — English-only.

### 4.8 A-07 — Crisis Overlay (Gate 4 / S4)
Hardcoded into the app bundle. Zero API calls, zero network dependency — must render fully offline. Contents: iCall, Vandrevala Foundation, NIMHANS, Snehi, and 112, each as a full-width `color.gate4.crisis` button with a phone icon and one-tap dial. All 5 always visible without scrolling on a standard device if possible; if scrolling is unavoidable, 112 (emergency) stays pinned at the bottom, always visible. No dismiss action while Gate 4 is active. High contrast, generous tap targets (56dp minimum), no breathing-pulse motion here — this screen should feel immediately legible, not paced-down.

### 4.9 Deferred (not MVP — reference only)
Language Selection (A-06d), Content Library (A-08), full 8-turn onboarding, multi-parameter A14 assessment UI, Sarvam cloud-voice selection. Do not scaffold nav entries or routes for these.

---

## 5. Accessibility

- Minimum tap target 44dp (56dp for crisis actions).
- Text contrast: body text on cream must meet WCAG AA (4.5:1) — `color.text.primary` on `color.background` passes; do not lighten `color.text.secondary` further than specified.
- Respect `prefers-reduced-motion` / system reduce-motion setting — disable the breathing pulse and all screen transitions beyond a simple cross-fade.
- All crisis-overlay phone actions must be reachable via screen reader with an unambiguous label ("Call iCall, 9152987821") — never rely on icon alone.
- Support Android system font-scaling up to at least 130% without clipping chat bubbles or the crisis overlay.

---

## 6. Content & Voice Guidelines

- Active voice, plain verbs. A button says what happens: "Check in," not "Submit."
- Never diagnostic. No "your anxiety," no "your symptoms" — describe experience, not condition.
- Streak breaks are never framed as failure: use "Gaps happen. You're still here." not "Start your streak again."
- Errors describe what happened and what to do, without apologizing performatively: "That didn't send. Check your connection and try again," not "Oops! Something went wrong 😅."
- Empty states are invitations, not apologies: Progress screen before 3 sessions of history reads "Your trend will show up here after a few more check-ins" rather than "No data yet."

---

## 7. Implementation Notes for the Coding Agent

- Flutter theme should expose all tokens in Section 2 as a single `EviaTheme` object (colors, text styles, radii, motion durations) — no hardcoded hex values in widget code.
- Chat bubble and SRS modal widgets should be built once and reused between A-02 (intake) and A-04 (chat) — do not fork two implementations.
- Gate-severity banners (2.3.3) should be a single `GateNotice` widget parameterized by severity (`amber`/`rust`), not three separate widgets.
- The crisis overlay must be a top-level route that can be pushed from anywhere in the navigation stack and does not depend on any provider/state that requires a network call to render.
- `flutter_tts` integration: buffer state should drive the breathing-pulse animation on the speaker icon (Section 3.3), not a separate loading spinner.
