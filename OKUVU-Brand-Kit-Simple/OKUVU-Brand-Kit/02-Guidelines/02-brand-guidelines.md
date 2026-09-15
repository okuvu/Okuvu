# OKUVU — 02 · Brand Guidelines (Logo, Color, Type, Voice)

> Technical rules for implementing the OKUVU brand on web and product surfaces.
> Current visual direction: **tapered spiral, no glow, neo violet · royal night palette** (2026-08-16).

## 1. Logo system

### 1.1 The mark
- **Shape:** Archimedean spiral, 1.75 turns, opening at the top. Reads as an "O" that never closes.
- **Meaning:** "oku-" = Bantu infinitive prefix for ongoing, unfinished action → *always becoming*.
- **Thickness:** tapered (thin at both ends, thickest mid-turn). Never render with uniform stroke width.
- **Tip dot:** always the honey accent (`#E8A33D`). It is the "first light / grounded moment."

### 1.2 Files (all in `okuvu/brand/okuvu-neo-violet/`)
| Asset | File | Notes |
|---|---|---|
| Light mark | `okuvu-mark.svg/.png` | royal gradient (night→orchid), for light/transparent surfaces |
| Dark mark | `okuvu-mark-dark.svg/.png` | lavender→orchid, for dark surfaces |
| Light lockup | `okuvu-lockup.svg/.png` | mark + OKUVU + tagline, light surfaces |
| Dark lockup | `okuvu-lockup-dark.svg/.png` | for dark surfaces |
| App icon | `okuvu-appicon.svg/.png` (1024) + `-512.png` | royal night bg, lavender thread, honey tip |
| Brand board | `okuvu-brand-board.svg/.png` | presentation |
| Full palette | `okuvu-brand-palette.svg/.png` | color system + usage rules |

### 1.3 Usage rules
- **Clear space:** on all sides, minimum = height of the mark's opening (approx. 1/4 of mark height). Keep clear.
- **Minimum sizes:** mark ≥ 24px (favicon 32px); lockup ≥ 160px wide; wordmark alone ≥ 80px.
- **Backgrounds:** light mark on light/white/paper surfaces; dark mark on royal night / dark surfaces.
- **Never:** stretch, rotate, outline, recolor arbitrarily, add glow/shadow, put on busy photos without a scrim,
  use the mark without the tip dot, re-draw the spiral as a closed circle.

### 1.4 Wordmark
- **Text:** `OKUVU` — Poppins SemiBold, letter-spacing +10px (≈ 0.1em).
- Light surfaces: royal purple `#5E2E91`. Dark surfaces: lavender tint `#EDE9FE`.
- In prose/brand copy, prefer lowercase "okuvu".

## 2. Color system (see `okuvu-brand-palette` sheet for full usage)

### 2.1 Core
| Token | Hex | Role |
|---|---|---|
| royal night | `#2A0F4E` | dark bg, deepest surface |
| royal purple | `#5E2E91` | headlines (light mode), secondary dark surface |
| electric violet | `#7C3AED` | primary action, focus |
| orchid | `#A78BFA` | light accent, dark-mode body text |
| lavender tint | `#EDE9FE` | dark-mode text, thread on dark, chips |

### 2.1b Warm & supporting (added v9)
| Token | Hex | Role |
|---|---|---|
| honey | `#E8A33D` | first-light accent · tip dot · warmth · success |
| honey soft | `#F4C976` | honey tints on dark surfaces, hover warmth |
| honey ink | `#A9741C` | honey-based text on light surfaces (contrast) |

### 2.1c Pastels (added v9)
| Token | Hex | Role |
|---|---|---|
| lilac | `#DCCBF2` | soft purple surfaces, chips, illustrations |
| orchid wash | `#F0E7FC` | lightest purple wash, cards on light bg |
| cream | `#FBF2DF` | warm paper tint — "first light" surfaces |
| butter | `#F9E7BE` | warm chips, highlights, soft CTA tint |

### 2.1d Complementary — soft sage (green kept soft/pastel)
| Token | Hex | Role |
|---|---|---|
| sage | `#7C9E8F` | soft complementary accent |
| sage deep | `#4E7564` | sage text/success on light |
| sage tint | `#E4EFE9` | pale green wash, success-soft |
| pastel mint | `#D8EBE0` | lightest green surface |

Green is a **complementary, pastel-toned** member of the palette — never bright/fluorescent (no `#34D399`-style neon).

### 2.2 Neutrals
| Token | Hex | Role |
|---|---|---|
| charcoal ink | `#1F1B2E` | light-mode body text |
| slate | `#6B6B80` | secondary text (light mode) |
| silver | `#E5E7EB` | neutrals, icons (never text) |
| paper | `#F7F5FD` | light-mode page background |
| warm paper | `#FDF9F2` | warm light surfaces (optional cream base) |
| hairline | `#E2DCF2` | borders, dividers |

### 2.3 Mode mapping
- **Light mode:** bg = paper/white, headlines = royal purple, body = charcoal ink, accent = electric violet, warm accents = honey, chips = lavender tint / lilac.
- **Dark mode:** bg = royal night, headlines = lavender tint, body = orchid, accent = honey + orchid (first light on night), cards = royal purple.

## 3. Typography
- **Font family:** Poppins (Google Fonts). Weights: 300 (Light), 400 (Regular), 600 (SemiBold). No other weights.
- **Wordmark:** SemiBold, +0.1em tracking, uppercase.
- **Tagline:** Light, +0.2em tracking, lowercase.
- **Headlines:** SemiBold. **Body:** Regular, 16px/1.6. **Captions/labels:** Regular 12–13px, +0.05em.
- **Scale (web):** display 56 / h1 40 / h2 32 / h3 24 / body 16 / caption 13 / micro 11 (px).
- **Accessibility:** body text on paper must be ≥ 4.5:1. Lavender tint and silver are **never** body text on light bg.

## 4. Imagery & iconography
- Photography: soft, human, warm, "golden hour / dusk" mood; real people, no stocky stock photos; Indian + Gen Z representation.
- Icons: rounded, 2px stroke style (Lucide/Poppins-compatible set), in royal purple or lavender depending on surface.
- Never: harsh neon, clinical white coats, sad-and-rainy stereotypes, over-candid therapy scenes.

## 5. Voice
- Warm, validating before suggesting. Never toxic positivity, never clinical-cold.
- **3 a.m. test:** if a line would sound out of place said gently at 3 a.m., cut it.
- Contractions and lowercase are fine (Gen Z). No exclamation marks for urgency; calm beats hype.
