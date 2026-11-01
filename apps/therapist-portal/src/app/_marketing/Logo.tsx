import Link from 'next/link';
import { copy } from '@/lib/marketing/copy';

/**
 * The lockup: mark + OKUVU wordmark.
 *
 * TODO(brand) — the final OKUVU master mark (indigo arch, sage embrace, centre
 * dot) is not in this repository. `public/brand/okuvu-mark.svg` is the previous
 * purple/honey spiral from OKUVU-Brand-Kit-Simple and is used unchanged rather
 * than redrawn or recoloured by hand: an approximated logo is worse than an
 * honestly out-of-date one, because it becomes the thing someone else copies.
 * When the master lands, drop it in at public/brand/okuvu-mark.svg and this
 * component keeps working — nothing else references the path.
 *
 * The wordmark is live text in Poppins SemiBold (the brand sheet's wordmark
 * face, already self-hosted), not part of the SVG, so it stays crisp and
 * readable at any size and is announced once, by the link's accessible name.
 */
export default function Logo({ wordmarkTone = 'ink' }: { wordmarkTone?: 'ink' | 'light' }) {
  return (
    <span className="mk-logo">
      {/* Both brand files ship in the repo; CSS picks one per colour scheme, so
          the mark never turns to mud on a dark band. The dark cut is the
          lavender→orchid variant from the same brand kit. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- 28px inline SVG, next/image would add nothing */}
      <img
        src="/brand/okuvu-mark.svg"
        alt=""
        width={28}
        height={28}
        aria-hidden="true"
        className="mk-logo-mark mk-logo-mark--light"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
      <img
        src="/brand/okuvu-mark-dark.svg"
        alt=""
        width={28}
        height={28}
        aria-hidden="true"
        className="mk-logo-mark mk-logo-mark--dark"
      />
      <span className="mk-logo-word" data-tone={wordmarkTone}>
        OKUVU
      </span>
    </span>
  );
}

export function LogoLink({ wordmarkTone = 'ink' }: { wordmarkTone?: 'ink' | 'light' }) {
  return (
    <Link href="/" className="mk-logo-link" aria-label={copy.art.wordmark}>
      <Logo wordmarkTone={wordmarkTone} />
    </Link>
  );
}
