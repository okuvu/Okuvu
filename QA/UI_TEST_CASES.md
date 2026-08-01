# Evia Therapist Portal — UI / UX / Accessibility Test Cases

**Purpose:** Verify the portal against the design system in `docs/design/EVIA_Therapist_Portal_Design.md`, plus accessibility, responsive behavior, and cross-browser rendering.

**Design references (verified):**
- **Portal bg** `#F4F6F8`, **surface** `#FFFFFF`, **brand primary** `#1A6B5A`, **border** `#E1E6E4`.
- **Badge colors:** red `#B5382E` (B1 Safety Review), amber `#C97A1A` (B2/B3/B5), blue `#2F5FA3` (B4).
- **Typography:** Manrope (UI) + IBM Plex Mono (IDs/timestamps) per Design.md §2.2. **Note:** the portal currently loads *Inter* + Material Symbols (see `src/app/layout.tsx`); any divergence is logged in BUG_CANDIDATES.md, not silently treated as correct.
- **Design signature:** 3px colored left border on dashboard rows and detail panels; color restrained to that rail + badge chips.
- **Accessibility (Design.md §6):** severity must have a text label (not color alone); focus trapping on modals; table rows keyboard-navigable; body text contrast ≥ 4.5:1.
- **MVP verified:** 3 care plans, read-only T-02, no T-04/T-06/T-07 in scope.

---

## A. Layout & Components

### UI-001 — Portal chrome: background, sidebar, top bar

| Field | Value |
|---|---|
| Test Case ID | UI-001 |
| Module | UI |
| Feature | Layout chrome |
| Story ID | E10-S04 |
| Priority | P1 |
| Severity | Medium |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Log in and view `/dashboard` | Background is portal grey `#F4F6F8`; content on white cards |
| 2 | Confirm sidebar | Fixed left sidebar (`w-[240px]`) with "Evia / Therapist Portal" header, nav items (Dashboard; Schedule/Safety Reviews/Reports disabled), therapist identity, Sign out |
| 3 | Confirm the active nav state | Dashboard item highlighted with brand teal `#1A6B5A` background/white text when on `/dashboard` |
| 4 | Confirm no marketing copy on login | `/auth` is a bare tool screen (no landing-page copy) |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### UI-002 — Dashboard row design (left-border signature)

| Field | Value |
|---|---|
| Test Case ID | UI-002 |
| Module | UI |
| Feature | T-01 row styling |
| Story ID | E10-S04 |
| Priority | P1 |
| Severity | Medium |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | View dashboard with an S3/S4 client | That row has a 3px red left border (`border-l-[3px] border-l-[#C0392B]`) and light red row bg — matches the "highest-severity color on the row rail" signature |
| 2 | Confirm non-alert rows have no colored rail | Zebra striping only (`bg-white` / `bg-[#F9FAFB]`), hover teal tint |
| 3 | Confirm care plan + status badges | Pill chips with 12%-opacity bg + full-opacity text (CP1 green `#E8F5EE`/`#2D8A5E`, CP2 blue `#EEF2FF`/`#4B6BFF`, CP3 yellow `#FEF9E7`/`#B7950B`) |
| 4 | Confirm the row is a single click target per Design.md §3.2 | Per design the whole row opens T-02. If only the phone/View link is clickable, log in BUG_CANDIDATES.md |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### UI-003 — Client overview cards

| Field | Value |
|---|---|
| Test Case ID | UI-003 |
| Module | UI |
| Feature | T-02 card layout |
| Story ID | E10-S06 |
| Priority | P1 |
| Severity | Medium |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Open a client overview | Cards: CLIENT OVERVIEW, CARE PLAN, Clinical reasoning (with teal left-border accent), LATEST SESSION SUMMARY, Session notes link |
| 2 | Confirm visual distinction provisional vs confirmed | Provisional = amber badge; Confirmed = green badge; text-only labels present (not color alone) |
| 3 | Confirm severity text labels | Safety "High (S3)"/"Critical (S4)" text present alongside dots — not color-only |
| 4 | Confirm no editing affordances on T-02 | All fields read-only; only "Manage →" navigates to T-03 |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### UI-004 — Program page uses design tokens

| Field | Value |
|---|---|
| Test Case ID | UI-004 |
| Module | UI |
| Feature | T-03 styling |
| Story ID | E11-S02 |
| Priority | P2 |
| Severity | Low |
| Objective | Confirm T-03 renders with the design-token classes (`bg-surface`, `text-on-surface`, `bg-primary-container`, `shadow-soft`, etc.) defined in `globals.css`. |
| Requirement Reference | Design.md §2; `src/app/globals.css` |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Open `/clients/<id>/program` | Header uses brand teal "Therapist Portal"; dropdown, Save (primary container), Cancel (surface container) render with tokens; no hardcoded hex in new code (token classes resolve) |
| 2 | Confirm the notice box | Teal left-border box: "Therapist notes you write in Session Notes are not used by Evia…" |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### UI-005 — Notes page privacy notice

| Field | Value |
|---|---|
| Test Case ID | UI-005 |
| Module | UI |
| Feature | T-05 privacy notice |
| Story ID | E11-S04, E11-S03 |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm the explicit non-ingestion notice is visible on the notes screen. |
| Requirement Reference | E11-S03 FR-4, Design.md §5.6 |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Open `/clients/<id>/notes` | Blue info box: "Privacy notice: Session notes are for your reference only… never read by the AI system." (plain language, matches design intent) |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## B. Accessibility

### UI-006 — Keyboard navigation: table rows

| Field | Value |
|---|---|
| Test Case ID | UI-006 |
| Module | Accessibility |
| Feature | Keyboard nav |
| Story ID | E10-S04, Design.md §6 |
| Priority | P1 |
| Severity | High |
| Objective | Confirm the dashboard client list is keyboard-operable. |
| Requirement Reference | Design.md §6 "table rows must be keyboard-navigable (tab + enter to open T-02)" |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | On `/dashboard`, Tab through the table | Phone-number link and "View →" link are focusable |
| 2 | Press Enter on the phone link | Navigates to `/clients/<id>` |
| 3 | Confirm the full row is focusable (design intent) | If only the two links are reachable (not the whole row), record; the essential path (open T-02 via keyboard) must work |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### UI-007 — Screen-reader labels

| Field | Value |
|---|---|
| Test Case ID | UI-007 |
| Module | Accessibility |
| Feature | ARIA labels |
| Story ID | E10-S04, E11-S02, E11-S04 |
| Priority | P1 |
| Severity | High |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Notes textarea | Has `<label htmlFor="note" className="sr-only">Note text</label>` — screen reader announces "Note text" |
| 2 | Care plan select | `<label htmlFor="care-plan-select" className="sr-only">Select Care Plan</label>` present |
| 3 | Notifications button in top bar | `aria-label="Notifications"` present |
| 4 | Error/status messages | Note validation/success messages have `role="alert"`/`aria-live` attributes; client overview error uses `role="alert"` |
| 5 | Run a screen reader (VoiceOver/NVDA) over `/auth` and `/dashboard` | Buttons and links announce meaningful names |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### UI-008 — Focus visibility and order

| Field | Value |
|---|---|
| Test Case ID | UI-008 |
| Module | Accessibility |
| Feature | Focus management |
| Story ID | E10-S04, E11-S02 |
| Priority | P1 |
| Severity | Medium |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Tab through the dashboard | Visible focus ring on links/buttons; logical order (sidebar → content) |
| 2 | Open care plan dropdown and Save | Focus moves in logical order; select + buttons focusable |
| 3 | Confirm no elements trap focus | Tab escapes all controls normally |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### UI-009 — Color is never the only signal

| Field | Value |
|---|---|
| Test Case ID | UI-009 |
| Module | Accessibility |
| Feature | Colorblind-safe severity |
| Story ID | Design.md §6 |
| Priority | P1 |
| Severity | High |
| Objective | Confirm safety/assignment severity always has a text label, not color alone. |
| Requirement Reference | Design.md §6 |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Client overview safety states | "Stable (S0)" … "Critical (S4)" all include text |
| 2 | Dashboard safety column for S2 | Shows an amber dot **only** (`ClientTable.tsx:69-71`) — no text. Log as a finding (color-only indicator) in BUG_CANDIDATES.md |
| 3 | Assignment badges | Always text ("Confirmed"/"Provisional") |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### UI-010 — Text contrast

| Field | Value |
|---|---|
| Test Case ID | UI-010 |
| Module | Accessibility |
| Feature | Contrast |
| Story ID | Design.md §6 |
| Priority | P1 |
| Severity | Medium |
| Objective | Confirm body text meets 4.5:1 contrast on the portal grey background. |
| Requirement Reference | Design.md §6 |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Use a contrast checker on body text (`#5C6560`-style secondary, `text-gray-500` etc.) on `#F4F6F8`/white | ≥4.5:1 for body text; large text ≥3:1. Record any failures |
| 2 | Spot-check timestamps/metadata text | Legible on white cards |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## C. Responsive

### UI-011 — Desktop layout

| Field | Value |
|---|---|
| Test Case ID | UI-011 |
| Module | Responsive |
| Feature | Desktop |
| Story ID | E10-S04 |
| Priority | P1 |
| Severity | Medium |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | View at 1440×900 | Sidebar visible; content in `md:ml-[240px]` area; table full width; no horizontal scroll |
| 2 | View at 1920×1080 | Same, comfortable |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### UI-012 — Tablet (sidebar collapse point)

| Field | Value |
|---|---|
| Test Case ID | UI-012 |
| Module | Responsive |
| Feature | Tablet ≤768px |
| Story ID | E10-S04 |
| Priority | P2 |
| Severity | Low |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Resize to 768×1024 | Sidebar (`hidden md:flex`) still visible at 768; content offset by `md:ml-[240px]` |
| 2 | Resize below 768 (e.g. 700px) | Sidebar hidden; content full width; no broken overlap |
| 3 | Check client overview and program pages at 700px | No horizontal overflow; cards stack acceptably |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### UI-013 — Mobile (375px) sanity

| Field | Value |
|---|---|
| Test Case ID | UI-013 |
| Module | Responsive |
| Feature | Mobile |
| Story ID | E10-S04 |
| Priority | P2 |
| Severity | Low |
| Objective | Portal is desktop-first; verify no broken layout on a phone viewport. |
| Requirement Reference | Design.md (portal is a desktop tool) |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | View at 375×812 (DevTools) | Sidebar hidden; dashboard table scrolls horizontally within its container; login screen centered; no unreadable overlap |
| 2 | Open client overview + program | Content fits; buttons/select usable |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## D. Cross-browser

### UI-014 — Cross-browser consistency (Chrome, Firefox, Edge)

| Field | Value |
|---|---|
| Test Case ID | UI-014 |
| Module | Cross-browser |
| Feature | Rendering parity |
| Story ID | E10-S04, E11-S02, E11-S04 |
| Priority | P1 |
| Severity | Medium |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | Perform the smoke suite (SMK-001…006) in Chrome, Firefox, and Edge | All pass; identical layout, no console errors, no layout shift |
| 2 | Check the login screen in each browser | Google OAuth button renders identically |
| 3 | (If macOS available) repeat in Safari | Same results |

**Result:** Pass / Fail / Blocked — **Notes:**

---

### UI-015 — Console errors

| Field | Value |
|---|---|
| Test Case ID | UI-015 |
| Module | Cross-browser |
| Feature | Console cleanliness |
| Story ID | All |
| Priority | P2 |
| Severity | Low |

| # | Execution Step | Expected Result |
|---|---|---|
| 1 | With DevTools open, walk `/auth` → `/dashboard` → `/clients/<id>` → program → notes | No uncaught exceptions or React key warnings in console (React key warnings on `clients.map` are acceptable but log if present) |
| 2 | Toggle network offline mid-session | Graceful error states (already covered in functional suite); no unhandled promise rejections logged |

**Result:** Pass / Fail / Blocked — **Notes:**

---

## UI Test Summary

| ID | Area | Priority | Status |
|---|---|---|---|
| UI-001 | Layout chrome | P1 | |
| UI-002 | Dashboard row design | P1 | |
| UI-003 | Client overview cards | P1 | |
| UI-004 | Program page tokens | P2 | |
| UI-005 | Notes privacy notice | P1 | |
| UI-006 | Keyboard nav | P1 | |
| UI-007 | Screen-reader labels | P1 | |
| UI-008 | Focus management | P1 | |
| UI-009 | Color-not-only | P1 | |
| UI-010 | Contrast | P1 | |
| UI-011 | Desktop responsive | P1 | |
| UI-012 | Tablet responsive | P2 | |
| UI-013 | Mobile sanity | P2 | |
| UI-014 | Cross-browser | P1 | |
| UI-015 | Console cleanliness | P2 | |
