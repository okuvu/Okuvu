# Evia Therapist Portal — Design.md

**For: AI coding agents (Claude Code, Cursor) implementing the Next.js therapist portal**
**Scope: Verified MVP only — see Section 0 before building anything.**

---

## 0. Read This First — MVP Scope Discipline

The full therapist-interface spec (EVIA_Therapist_Interface_v2_0) describes a system built around 10 care plans, a multi-parameter A14 assessment engine, and a 15-agent architecture. **That is not what exists in the current build.** Build to the verified MVP below, and treat anything marked "Full Architecture (not MVP)" as forward reference only.

**Verified MVP scope:**
- **3 care plans only**: CP1 Anxiety, CP2 Depression, CP3 Stress/Burnout. No CP4–CP10, no secondary-care-plan dropdown.
- **SRS-only measurement**: the client overview shows a single 1–4 Session Rating Scale trend. There is no multi-parameter A14 construct trending, and no "measurement context note" field tied to a richer assessment engine — omit it unless a backend story explicitly adds it.
- **One therapeutic agent (A2)** feeding the client's session activity — the portal is not yet showing routing across A3–A8.
- **English only** — no language_validation_status field, no back-translation flags.
- **tRPC runs in-process** (bypasses Fastify) — this is a backend note, not a UI concern, but keep API-error handling generic rather than assuming a particular gateway's error shape.
- Badge system (Section 4) and panel system (Section 5) are the two pieces of the full spec that **are** already real and should be built faithfully — these came from G-05/IC-08 work and are considered current, not future.

If a requested screen or field depends on architecture not yet live (secondary CP, multi-parameter assessment, non-English content), flag it back rather than building the full-spec version quietly.

---

## 1. Product Context & Design Principles

The therapist portal is a configuration and oversight tool for the clinician who supervises what Evia is allowed to do with a given client — it is not a chat product and should not look like one. A therapist using this between clients needs to update a client's settings in under three minutes without a training session.

**Four non-negotiable principles (carried over verbatim from the interface spec — do not soften these):**

1. **Therapist authority first.** Evia never suggests or reinforces anything a therapist hasn't explicitly allowed. The UI should never imply Evia is making autonomous clinical decisions.
2. **Low cognitive load.** A therapist should be able to update a client's program in under 3 minutes. Every screen should be scannable in one pass.
3. **Dropdowns over free text.** Configuration inputs are constrained choices wherever clinically possible — free text is reserved for genuinely narrative fields (session notes).
4. **Preview before deployment.** Any configuration change that affects what Evia says to a client must be previewable before it goes live.

**Design signature:** a single restrained device carries all urgency signaling — a **3px colored left border** on dashboard rows and detail panels. No colored backgrounds, no badge-shaped icons scattered through the UI, no red text. Color appears only in that one left rail plus the corresponding badge chip. This is what makes the portal read as a serious clinical tool rather than a SaaS dashboard with notification clutter.

---

## 2. Design Tokens

**Rewritten 15 Sep 2026 (E99 rebrand)** — §2.1/§2.2 below now match `OKUVU-Brand-Kit-Simple/OKUVU-Brand-Kit/01-Palette/03-design-tokens.css` verbatim (the repo's actual, authoritative brand kit — CSS + JSON tokens, logo SVGs, and `02-Guidelines/02-brand-guidelines.md`), replacing the teal system below that this doc previously described as "the one deliberate visual thread connecting the portal to the mobile app." That thread is now the shared purple/honey/sage palette instead — mobile's own accent color (`#E8A33D`, "Marigold") is the identical hex as this kit's `honey` token, confirming it's still a deliberate cross-app link, just a different color family.

### 2.1 Color

Full palette (`03-design-tokens.css`):

| Token | Hex | Role |
|---|---|---|
| `royal-night` | `#2A0F4E` | Darkest — chrome bar gradient start, deepest surface |
| `royal-purple` | `#5E2E91` | Chrome bar gradient end, hover-darken of `violet` |
| `indigo-violet` | `#6E62B4` | Chrome bar gradient mid-stop |
| `violet` | `#7B6CD9` | Primary buttons, links, active nav — the portal's `--accent` |
| `orchid` / `orchid-soft` | `#A78BFA` / `#C4B5FD` | Lighter accents |
| `lavender-tint` | `#EDE9FE` | Text/wordmark on dark surfaces (e.g. the chrome bar) |
| `honey` / `honey-bright` / `honey-deep` / `honey-tint` | `#E8A33D` / `#F0B25E` / `#D68F24` / `#FBF0DC` | Warm accent, "first light" — also this portal's practical stand-in for provisional/caution/in-progress states (no dedicated warning token exists in the kit; honey is the same color family as the teal system's old amber, so it's the more faithful swap than the sage/green family) |
| `sage` / `sage-deep` / `sage-tint` / `pastel-mint` | `#7C9E8F` / `#4E7564` / `#E4EFE9` / `#D8EBE0` | Success/confirmed/safety-positive — the kit's `--success`/`--success-soft`. Soft/pastel only — never bright/neon green |
| `oat` / `oat-elevated` | `#F7F3FD` / `#FEFCFF` | App background / card surface |
| `charcoal-ink` / `ink-soft` | `#26222E` / `#6E658A` | Body text / secondary text |
| `hairline` | `#E7DEF6` | Borders, dividers |

**Not covered by the kit, kept from the old system (unchanged hue, just consolidated to one definition):** danger/crisis red — the kit has no red token at all; changing a safety-indicator color is a clinical decision, not a brand one.

### 2.2 Typography

- **Wordmark only** — Poppins SemiBold (600), +0.1em tracking, uppercase. Loaded via `next/font/local` (a bundled `.woff2`, not `next/font/google` — the latter needs network access at build time). This is the first real typographic brand element the portal has ever rendered; previously it was plain system-font text.
- **Body/UI text** — unchanged, plain system stack. The brand kit's own type scale (`--fs-display` through `--fs-micro`, Poppins 300/400/600 throughout) exists for a future pass but wasn't required to ship the chrome-bar rebrand, so it hasn't been adopted yet — don't assume body text is Poppins until that's actually done.
- Manrope / IBM Plex Mono (below) describe the *old* teal-era system and no longer reflect the implementation — left here only as history until a real typography pass happens:

| Style | Face | Size | Weight |
|---|---|---|---|
| Page title | Manrope | 24sp | 700 |
| Section header | Manrope | 16sp | 700 |
| Body | Manrope | 15sp | 400 |
| Table cell | Manrope | 14sp | 400 |
| Metadata / IDs / timestamps | IBM Plex Mono | 13sp | 400 |
| Button label | Manrope | 14sp | 600 |

### 2.3 Spacing & Radius
Same 8pt grid as mobile (`4, 8, 12, 16, 24, 32, 48`). The brand kit also defines `r-sm 8px / r-md 14px / r-lg 20px / r-xl 28px / r-pill 999px` (close to the radii already in use) — adopted alongside the color tokens in `globals.css`, low-risk since they're near the previous values.

### 2.4 Elevation
The brand kit's shadow tokens are royal-night-tinted rather than neutral black: `shadow-sm 0 1px 2px rgba(42,15,78,.08)`, `shadow-md 0 4px 16px rgba(42,15,78,.10)`, `shadow-lg 0 12px 40px rgba(42,15,78,.16)`.

### 2.5 Portal Chrome Bar

New as of the E99 rebrand — the portal's first-ever portal-wide top chrome bar (`apps/therapist-portal/src/app/components/TopBar.tsx`), full-width, present on every page including the unauthenticated auth screen. Background is the kit's own `--brand-thread` gradient (`linear-gradient(135deg, royal-night, indigo-violet, orchid)`). Carries the real spiral-mark logo for the first time (`okuvu-mark-dark.svg` — the light-on-dark variant, per the kit's own "dark mark on royal night / dark surfaces" rule) next to the Poppins wordmark; previously the portal only ever showed plain text "OKUVU," never the actual mark. The left sidebar (`sidebar.tsx`) sits below this bar and no longer carries its own wordmark header — the chrome bar owns that now.

**What this section does not cover:** §5's screen list (T-00–T-07) and the B1-B5 badge system below describe an older MVP conception that no longer matches what's actually built — no Appointments, no Add-Client wizard, no client-detail tab strip, no consent chip anywhere in that section. Reconciling §3-§7 with current reality is a separate, larger documentation task, out of scope for this rebrand pass.

---

## 3. Component Library

### 3.1 The left-border panel (signature component)
A single reusable component: a card with a 3px colored left border (badge color from 2.1), a bold one-line header, one paragraph of plain-language body text, and 1–2 action buttons. Every clinical-state notice in the portal (rupture alert, stage avoidance, peer concern) is an instance of this one component with different props — do not build three separate panel components.

### 3.2 Dashboard row
Client name, last-update timestamp (Plex Mono), and up to 3 badge chips right-aligned. The 3px left border on the row itself takes the color of the **highest-severity** badge present (red > amber > blue). Row is a single click target opening T-02.

### 3.3 Badge chip
Small pill, `radius.full`, colored background at 12% opacity of the badge color, colored text at full opacity, no icon — text label only ("Safety Review", "Care Plan Hold," etc.). Kept deliberately unexciting; this is a clinical flag, not a gamification element.

### 3.4 Dropdown (care plan selector, etc.)
Standard select, always shows the current value even when closed, never defaults to a blank/placeholder state for an already-configured client. For care plan specifically: 3 options only (Anxiety / Depression / Stress & Burnout) for MVP — do not build the full CP1–CP10 list or a secondary-CP affordance.

### 3.5 Preview modal (T-06)
Full-screen overlay on mobile-width viewports, centered modal (max-width 640px) on desktop. Shows sample Evia turns rendered in the *actual mobile chat bubble component* from the mobile design system (Section 3.3 of the mobile Design.md) so what the therapist previews is pixel-faithful to what the client will see. Two footer actions only: "Approve & deploy" (primary, teal) and "Back to adjust" (text button). No silent auto-save — configuration changes made pre-preview are staged, not written, until approved.

### 3.6 Credential-confirmation action
Used for the psychosis-flag-clear action (T-04) and any other high-consequence write. A modal requiring the therapist's password (and RCI number where specified) re-entered before the action executes — never a single-click confirm for these specific actions.

### 3.7 Buttons
- **Primary** — `color.brand.primary` fill, white text, `radius.sm`.
- **Secondary** — 1px `color.brand.primary` stroke, teal text.
- **Destructive/high-consequence** (credential-confirmation actions) — outlined in `color.badge.red`, not filled — the confirmation modal itself carries the weight, the trigger button shouldn't shout.

---

## 4. Badge System (T-01 Dashboard)

Build exactly these five, faithfully — this part of the spec is current, not aspirational.

| Badge | Color | Dismissable without action? | Trigger condition |
|---|---|---|---|
| B1 Safety Review Required | Red | No | Psychosis flag active |
| B2 Care Plan Hold | Amber | No | Onboarding hold — no CP assigned yet |
| B3 Alliance Rupture | Amber | Only after viewing repair plan | Rupture detected |
| B4 Stage Avoidance | Blue | Yes, immediately | Stage avoidance pattern flagged |
| B5 Peer Concern | Amber | Only after "Mark as noted" | Class A peer-disclosure entry, institutional-led mode only |

A badge that "cannot be dismissed without action" must not expose any UI affordance that looks like a dismiss control (no "x" icon) until the required action is actually available — don't render a disabled close button, omit it entirely.

---

## 5. Screens — MVP Build List

### 5.1 T-00 — Secure Login
Centered card on `color.portal.bg`, Google OAuth as the primary button, plain email/password as secondary. No marketing copy on this screen — it's a tool, not a landing page.

### 5.2 T-01 — Dashboard
Client list as rows (3.2). Sort by highest-severity badge first, then by last-update recency. Search/filter bar above the list — plain text search on client name only for MVP, no advanced filter panel.

### 5.3 T-02 — Client Overview
Read-only. Order top to bottom:
1. A10 session brief (plain summary card — active CP, current care phase, last session themes; **no** language_validation_status field for MVP).
2. Alliance Rupture panel (3.1 instance, amber) — shown only if triggered.
3. Stage Avoidance notice (3.1 instance, blue) — shown only if triggered.
4. Peer Concern panel (3.1 instance, amber, institutional-led mode only) — shown only if triggered.

If none of 2–4 are triggered, the screen is just the brief card — do not render empty panel placeholders.

### 5.4 T-03 — Program Evia
Primary configuration screen. Care plan dropdown (3 options, 3.4). Focus themes (short multi-select tag list, not free text). Between-session tasks (dropdown of pre-approved task templates, not free text). Bipolar-hold banner (3.1 instance, red) when applicable, with "Assign care plan" / "Adjunct-only mode" actions. **Omit** the secondary-care-plan dropdown and the A14 measurement-context-note field for MVP.

### 5.5 T-04 — Safety & Boundaries
Conservative rule list: risk signals to monitor (read-only, system-defined), off-limits topics (multi-select from a fixed list, not free text), hold-state toggle. Psychosis-flag-clear action uses the credential-confirmation component (3.6).

### 5.6 T-05 — Session Notes
Free-text notes, reverse-chronological list, each entry timestamped in Plex Mono. Explicit inline note near the composer: "These notes are private to you and are not read by Evia unless you tag a theme below" — plain language, not a legal disclaimer tone. Optional theme tags (fixed list) per note.

### 5.7 T-06 — Preview Evia (modal)
See 3.5. Accessible from T-03 whenever a configuration change is staged.

### 5.8 T-07 — Invite Client
Simple form: client email, name, care-plan pre-assignment (optional, same 3-option dropdown). Sends invite email. Confirmation state is a plain inline message, not a toast.

---

## 6. Accessibility

- All left-border panels must also carry a text label of severity (not color alone) for colorblind users — the header text itself ("Alliance rupture detected") already satisfies this; don't rely on the border color as the only signal.
- Credential-confirmation modals must trap focus and be dismissible via Escape.
- Table rows must be keyboard-navigable (tab + enter to open T-02) in addition to mouse click.
- Minimum body text contrast 4.5:1 against `color.portal.bg`.

---

## 7. Content & Voice Guidelines

- Plain language over clinical jargon in anything the therapist reads as a notice: "Alliance rupture detected" is acceptable as a header (it's the correct clinical term and therapists know it), but the body text explaining it should be plain, not technical.
- Peer-disclosure panel text uses the client-facing plain phrase ("Significant concern about a peer"), never the internal classification label ("Class A") — that label is for logs, not for the therapist-facing panel body.
- Errors state what happened and what to do next, no apology filler.
- Never imply Evia acted autonomously: copy should read "You configured Evia to..." not "Evia decided to...".

---

## 8. Implementation Notes for the Coding Agent

- Build the left-border panel (3.1) as a single parameterized component (`ClinicalNoticePanel`) taking `severity`, `header`, `body`, and `actions` props — the three current use cases (rupture, stage avoidance, peer concern) are all instances, not separate components.
- Badge chip and dashboard row left-border color should derive from a single `severityColor(badge[])` utility that picks the highest-severity color present — don't hardcode per-badge-type row styling.
- The preview modal (3.5) must import/reuse the actual mobile chat-bubble component rather than re-implementing bubble styling in the Next.js app — if the two apps don't share a component library yet, treat this as a flagged gap rather than quietly re-styling an approximation.
- Keep all care-plan references to the 3-item MVP enum in a single shared constant — do not hardcode "3 options" in some places and leave room for 10 in others; when CP4+ ships, this should be a one-place change.
- tRPC error states should render through the generic error-notice pattern (Section 6) rather than assuming a specific gateway error shape, since tRPC currently runs in-process and bypasses Fastify.
