import localFont from 'next/font/local';

/**
 * OKUVU brand kit — Poppins SemiBold (600) only, for the wordmark.
 * next/font/local, NOT next/font/google: the latter fetches at build
 * time regardless of page rendering mode, which would newly require
 * network access during `next build` where none exists today. This
 * file is fetched once and bundled — offline-safe afterward.
 */
export const poppinsSemiBold = localFont({
  src: './fonts/Poppins-SemiBold.woff2',
  weight: '600',
  variable: '--font-poppins-semibold',
  display: 'swap',
});

/**
 * Marketing type — self-hosted, so the landing page makes no request to
 * fonts.gstatic.com at build or at runtime (the brief's "no Google CDN
 * requests", and this host builds offline).
 *
 * Fraunces is the variable cut carrying the SOFT and wght axes
 * (wght 100–900, SOFT 0–100). The raised SOFT axis — the "softer, rounder"
 * display look — is applied in marketing.css with
 * `font-variation-settings: 'SOFT' 100`, not here: next/font only maps
 * weight/style, and setting a second axis from CSS keeps the same file
 * usable at a different softness without a second download.
 *
 * The fallback-metric adjustment next/font does by default is left ON
 * (adjustFontFallback), which keeps the fallback's x-height and scale close to
 * the real face.
 *
 * `preload: false` on both. The measured CLS at 390 px over emulated 4G is
 * 0.073 — one shift at ~1.6 s, when the display face replaces the fallback and
 * the hero headline takes one more line. That is inside the 0.1 target, and
 * `preload: true` is not a fix here: this Next/Turbopack build emits no
 * `rel="preload" as="font"` link for a local face, so it changes nothing but
 * the intent. Turning preload on for fonts the portal never renders would also
 * be a per-page-load cost on /dashboard the moment that changes upstream.
 */
export const fraunces = localFont({
  src: './fonts/Fraunces-latin.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-fraunces',
  display: 'swap',
  preload: false,
  fallback: ['Georgia', 'serif'],
});

export const manrope = localFont({
  src: './fonts/Manrope-latin.woff2',
  weight: '200 800',
  style: 'normal',
  variable: '--font-manrope',
  display: 'swap',
  preload: false,
  fallback: ['system-ui', 'sans-serif'],
});
