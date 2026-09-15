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
