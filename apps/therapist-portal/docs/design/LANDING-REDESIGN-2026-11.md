# Landing page redesign — 1 November 2026

Scope: `apps/therapist-portal/src/app/page.tsx` and everything under
`src/app/_marketing/`. The portal (`/dashboard`, `/clients`, `/admin`) is
untouched: its styles live in `globals.css` `@theme`, and the marketing CSS is
a separate file that only the landing route imports, with every selector
prefixed `.mk-`.

No wording changed in `src/lib/marketing/copy.ts` except the new strings the
brief allowed: the hero eyebrow, image alt text, and the two captions
("Illustration", "Breathe with it"). Alt text and captions are flattened by
`marketing-copy.test.ts` as well, so they are subject to the same claim guard
as the rest of the page.

## Tokens

`src/app/_marketing/marketing.css` defines the five brand tokens on `:root`
(`--indigo #1C2243`, `--sage #6E8F73`, `--amber #D89A3A`, `--stone #E8E3D8`,
`--lavender #E7E9F2`) plus the three gradients (`--dawn`, `--twilight`,
`--evening`). Sections use semantic aliases (`--mk-bg`, `--mk-surface`,
`--mk-text`) that flip under `prefers-color-scheme: dark`, which is built on
the evening gradient. Only those custom properties go on `:root`; the file is
not loaded on any portal route.

Two deliberate deviations from the palette brief, both for contrast:

- **Sage never carries text.** Sage on stone is 2.8:1. Section labels use
  `--sage-ink` (#47664E), the same hue two steps down at 5.0:1.
- **Amber is only ever a fill.** The one amber control is "Join the waitlist",
  with indigo text (6.4:1).

## Type

Fraunces (variable, `SOFT` raised to 100 via `font-variation-settings`) for
display, Manrope for body, both self-hosted through `next/font/local` from
`src/app/fonts/`. Nothing is fetched from a font CDN at build or runtime —
this host builds offline. Hero headline: `clamp(2.5rem, 6vw, 4.5rem)`.

## Motion

All SVG + CSS, no animation library, and only `transform`/`opacity` animate:

| Where | What | Timing |
|---|---|---|
| Hero | three SVG waves (indigo, sage 40 %, lavender 60 %), 200 % wide | 30 s / 45 s / 60 s linear, alternating |
| Hero | phone sits on a breathing sage-lavender blob | 8 s, scale 1 → 1.03 |
| How it works | contour lines cross-fading and drifting | 40 s |
| Bento | breathing orb | 10 s (4 s in, 6 s out) |
| Between sections | squiggle draws once on scroll-in | 1.5 s ease-out |
| Bento | mood line draws once on scroll-in | 1.6 s |
| Therapist band | master-mark watermark + drifting radial glow | 26 s |
| Stone sections | feTurbulence grain in the background-image | static |

`MarketingMotion` owns the only JavaScript: an IntersectionObserver that sets
`data-inview` (looping animations are `animation-play-state: paused` unless in
view) and `data-drawn` (draw-once elements are unobserved after the first
intersection). `visibilitychange` pauses everything in a background tab.

Under `prefers-reduced-motion: reduce` every animation and transition stops,
the waves render static, and the squiggle/sparkline are drawn immediately
(`stroke-dashoffset: 0`).

No decoration sits over the crisis line or the disclaimers: the grain is a
background-image (which cannot cover content) and the footer carries no
pseudo-elements other than a 2 px twilight hairline above it.

## Screenshot placeholders

`src/lib/marketing/screens.ts` maps six slots — chat, mood, journal, breathing,
appointments, portal — and all six are `null` today. A null slot renders a
drawn illustration (solid cards and bubbles, indigo outlines, soft grey bars
where words would be) captioned "Illustration", with the frame's aspect ratio
fixed so nothing shifts. Swapping in a real screenshot is one line per slot;
the component already renders `next/image` with `sizes` when a path is set.

No slot says "coming soon": every illustration stands for a screen that ships
today, and the page's own claim is that nothing on it is on a roadmap.

## Brand mark

The master mark is the **spiral** — the purple→orchid arc with the honey dot
from `OKUVU-Brand-Kit-Simple`. Confirmed by the owner on 1 November 2026; the
earlier "indigo arch, sage embrace, centre dot" description in the brief
referred to a mark that does not exist. There is nothing to swap:

- `public/brand/okuvu-mark.svg` — purple cut, used on light surfaces.
- `public/brand/okuvu-mark-dark.svg` — lavender cut of the same mark, used on
  dark surfaces and for the therapist-band watermark. `prefers-color-scheme`
  picks between them in the nav.

Both are the supplied artwork, not redrawn. The master also arrives as
`okuvu-mark-dark.svg` at an 800×800 viewBox and as 512/1024 app-icon squares;
the repo already carries the same geometry at 400×400 (mark) and 1024 (icon),
with the icon background running `#2A0F4E→#5E2E91` against the sheet's
`#2C1051→#5C2D8E`. That difference is invisible at every size the page renders,
so the artwork was left alone rather than re-cut from a raster attachment.

The therapist band previously drew an invented arch-and-dome motif as its
watermark. With the spiral confirmed as master that shape was a logo that does
not exist, so it now renders the brand file itself at low opacity.

A repo-wide search found **no green-and-coral logo** anywhere — not in
`public/`, `src/app/icon.svg`, the mobile app icons, or any OG image (the app
sets no OG image at all). There was therefore nothing of that kind to replace
or remove.

## Photograph

`public/marketing/window-light.webp` — CC0, sourced from StockSnap, recorded
with author and licence in `public/marketing/CREDITS.md`. It is a calm,
faceless window-light photograph, and it is **not** identifiably Indian: the
free libraries that permit commercial use (Unsplash, Pexels, Openverse) block
automated access from the build host. That gap is written down in CREDITS.md
with the one-file fix.

## Measured

Emulated mid-range Android: 390 px, DPR 2, 4× CPU throttle, 1.6 Mbps / 150 ms
RTT, cold cache, real production build.

- **LCP** 828 ms (element: the `<h1>`). Target < 2.5 s.
- **CLS** 0.073 — one shift at ~1.6 s when Fraunces replaces the fallback and
  the headline takes one more line. Target < 0.1. `preload: true` is not a fix
  here: this Next/Turbopack build emits no `rel="preload" as="font"` for a
  local face.
- **Payload** 310 KB in 17 requests (largest: 71 KB JS chunk, 61 KB Fraunces,
  8 KB AVIF hero photograph).
- **Contrast** every text node measured in light and dark at 390 and 1440:
  zero failures at WCAG AA (gradient bands verified by calculation, since an
  automated pass cannot read a gradient's background).
- **Accessibility** one `h1`, headings in order, every image either `alt=""`
  with `aria-hidden` (decorative brand mark) or descriptive alt, illustrations
  exposed as `role="img"` with a label, all inputs labelled, no unlabelled
  links, amber focus ring with an indigo halo on every interactive element.

## Routing and assets

Apex/www keep serving the marketing page; `portal.okuvu.in` still 307s to
`/dashboard`. `src/proxy.ts` gained `/marketing/` in its **asset** allowlist
(the same shape as `/brand/`), because the image optimizer fetches the source
through the proxy — without it the photograph silently rendered as an empty
frame. A test asserts the asset path is public and that `/marketingx/...` still
redirects.

## Screenshots

`docs/design/landing-redesign/` — before (light) and after (light, dark,
reduced motion) at 390 px and 1440 px, full page.

## Verification

```bash
cd apps/therapist-portal
pnpm exec tsc --noEmit   # clean
pnpm test                # 252 tests, 22 files
pnpm build               # exit 0
```
