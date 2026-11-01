/**
 * Decorative line-art for the marketing page.
 *
 * Everything here is `aria-hidden` and drawn with strokes in sage and indigo:
 * no text, no numbers, no data. If it carried meaning it would belong in
 * copy.ts and in the alt text; because it carries none, a screen reader is
 * told to skip it.
 *
 * All motion lives in marketing.css and animates transform/opacity only, so
 * these components stay server components with no client JavaScript.
 */

export function HeroWaves() {
  return (
    <div className="mk-waves" aria-hidden="true" data-anim>
      {/* Indigo: the opaque ground the hero sits on. */}
      <svg className="mk-wave mk-wave--indigo" viewBox="0 0 2880 200" preserveAspectRatio="none" focusable="false">
        <path
          d="M0 160 Q180 132 360 160 T720 160 T1080 160 T1440 160 T1800 160 T2160 160 T2520 160 T2880 160 L2880 200 L0 200 Z"
          fill="currentColor"
        />
      </svg>
      {/* Sage at 40 %, drifting the other way. */}
      <svg className="mk-wave mk-wave--sage" viewBox="0 0 2880 200" preserveAspectRatio="none" focusable="false">
        <path
          d="M0 128 Q180 76 360 128 T720 128 T1080 128 T1440 128 T1800 128 T2160 128 T2520 128 T2880 128 L2880 200 L0 200 Z"
          fill="currentColor"
        />
      </svg>
      {/* Lavender at 60 %, the slowest. */}
      <svg className="mk-wave mk-wave--lavender" viewBox="0 0 2880 200" preserveAspectRatio="none" focusable="false">
        <path
          d="M0 92 Q180 24 360 92 T720 92 T1080 92 T1440 92 T1800 92 T2160 92 T2520 92 T2880 92 L2880 200 L0 200 Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}

/**
 * The hero visual: the master mark itself, large, with the wordmark under it.
 *
 * This replaces the phone mock that used to hold the hero. The brand was the
 * least visible thing on its own page, so the largest piece of art in the hero
 * is now the real logo rather than a drawing of the product.
 *
 * The artwork is `public/brand/okuvu-mark.svg` — the master file, unchanged,
 * not a redraw and not a simplified cut. The lavender cut replaces it on a dark
 * ground; which one is visible is decided by CSS (see `.mk-mark-big--dark` in
 * marketing.css), not by a media query, so the switch in the nav can override
 * the operating system.
 *
 * The motion is calm on purpose: the spiral drifts a few degrees and breathes,
 * a soft halo behind it swells, two sage rings ripple out, and the honey dot
 * glows. That is a mark that is alive, not a loading spinner. All of it is
 * transform/opacity, it pauses off-screen (MarketingMotion sets data-inview),
 * and it stops entirely under prefers-reduced-motion.
 *
 * The honey dot's halo is placed from the mark's own geometry, not by eye: the
 * dot sits at 399.5,187.5 of the 800-unit canvas, which after the framing in
 * marketing.css (the art is scaled 185% to fill the box) lands at 54.7% / 4.2%
 * of the frame. It rides inside the rotor, so it turns with the artwork instead
 * of drifting off it. If the master file is ever re-cut, those numbers move
 * with it.
 */
export function HeroMark() {
  return (
    <div className="mk-mark-stage" data-anim>
      <div className="mk-mark-frame">
        <span className="mk-mark-aura" aria-hidden="true" />
        <span className="mk-mark-ripple mk-mark-ripple--a" aria-hidden="true" />
        <span className="mk-mark-ripple mk-mark-ripple--b" aria-hidden="true" />
        <div className="mk-mark-rotor" aria-hidden="true">
          {/* Two cuts of the master file, one shown at a time by CSS. A
              <picture> would be lighter — one file downloaded either way — but
              its media query can only follow the operating system, so a visitor
              who picked light on a dark device would get the lavender cut on a
              pale page. The dark file is deferred, so it only loads when the
              theme actually asks for it. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative SVG, next/image adds nothing */}
          <img
            className="mk-mark-big mk-mark-big--light"
            src="/brand/okuvu-mark.svg"
            alt=""
            width={800}
            height={800}
            fetchPriority="high"
            decoding="async"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative SVG, next/image adds nothing */}
          <img
            className="mk-mark-big mk-mark-big--dark"
            src="/brand/okuvu-mark-dark.svg"
            alt=""
            width={800}
            height={800}
            loading="lazy"
            fetchPriority="low"
            decoding="async"
          />
          <span className="mk-mark-dot" />
        </div>
      </div>
      <span className="mk-mark-word" aria-hidden="true">
        OKUVU
      </span>
    </div>
  );
}

/**
 * Faint contour lines behind "How it works".
 *
 * Three copies of the same contour set are cross-faded and very slowly scaled;
 * that reads as a morph without animating the `d` attribute (path morphing is a
 * layout-class animation and would break the transform/opacity rule).
 */
export function TopoContours() {
  const contours = [
    'M40 210 C120 120 250 96 360 130 C470 164 520 250 620 252 C720 254 760 176 820 160',
    'M20 268 C120 190 240 168 350 196 C470 226 520 306 630 312 C740 318 790 250 860 236',
    'M60 330 C160 268 260 252 360 272 C470 294 540 360 650 366 C760 372 810 320 880 310',
    'M0 392 C120 340 250 330 370 348 C500 368 560 420 680 424 C790 428 840 392 900 386',
    'M120 152 C190 96 290 84 372 104 C460 126 500 178 580 182',
    'M180 96 C240 52 320 46 380 60',
  ];
  return (
    <div className="mk-topo" aria-hidden="true">
      <svg viewBox="0 0 900 460" preserveAspectRatio="xMidYMid slice" focusable="false">
        {contours.map((d, i) => (
          <path key={d} d={d} className={`mk-topo-line mk-topo-line--${i % 3}`} />
        ))}
      </svg>
    </div>
  );
}

/**
 * Hand-drawn squiggle between sections. Draws itself once when it scrolls into
 * view (MarketingMotion adds data-drawn="1"); it never undraws or repeats.
 */
export function Squiggle() {
  return (
    <div className="mk-squiggle" aria-hidden="true" data-draw>
      <svg viewBox="0 0 900 44" preserveAspectRatio="none" focusable="false">
        <path
          className="mk-squiggle-path"
          pathLength={1}
          d="M4 26 C40 6 62 40 98 24 C134 8 156 38 192 22 C228 6 250 40 286 24 C322 8 344 38 380 22 C416 6 438 40 474 24 C510 8 532 38 568 22 C604 6 626 40 662 24 C698 8 720 38 756 22 C792 6 814 40 850 24 C870 16 884 18 896 22"
        />
      </svg>
    </div>
  );
}

/**
 * The master mark, very large and faint, behind the therapist band.
 *
 * This is the brand file itself (`public/brand/okuvu-mark-dark.svg`, the
 * lavender cut), not a redrawn motif: an approximated logo becomes the thing
 * someone copies, so the watermark is the artwork with the opacity turned
 * down. Decorative, so it is hidden from the accessibility tree.
 */
export function MarkWatermark() {
  return (
    <div className="mk-watermark" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative SVG watermark, next/image adds nothing */}
      <img src="/brand/okuvu-mark-dark.svg" alt="" width={400} height={400} />
    </div>
  );
}

/** Step 01 — an invite card with a key on it. */
export function InviteArt() {
  return (
    <svg className="mk-step-art" viewBox="0 0 120 92" aria-hidden="true" focusable="false">
      <rect x="8" y="10" width="104" height="62" rx="12" className="mk-stroke-indigo" />
      <path d="M8 30 H112" className="mk-stroke-indigo mk-stroke-thin" />
      <circle cx="22" cy="20" r="3" fill="var(--sage)" />
      <circle cx="34" cy="20" r="3" fill="var(--sage)" opacity=".55" />
      <circle cx="62" cy="52" r="10" className="mk-stroke-sage" />
      <path d="M72 52 H100 M92 52 V60 M99 52 V58" className="mk-stroke-sage" />
      <path d="M18 46 H44" className="mk-stroke-indigo mk-stroke-thin" opacity=".45" />
      <path d="M18 56 H38" className="mk-stroke-indigo mk-stroke-thin" opacity=".3" />
    </svg>
  );
}

/** Step 02 — a conversation, two bubbles. */
export function ChatArt() {
  return (
    <svg className="mk-step-art" viewBox="0 0 120 92" aria-hidden="true" focusable="false">
      <path
        d="M12 18 H74 A10 10 0 0 1 84 28 V46 A10 10 0 0 1 74 56 H32 L20 66 V56 H12 A10 10 0 0 1 2 46 V28 A10 10 0 0 1 12 18 Z"
        className="mk-stroke-indigo"
      />
      <path d="M16 30 H66 M16 40 H52" className="mk-stroke-indigo mk-stroke-thin" opacity=".45" />
      <path
        d="M96 44 H110 A8 8 0 0 1 118 52 V66 A8 8 0 0 1 110 74 H100 L92 82 V74 H96 A8 8 0 0 1 88 66 V52 A8 8 0 0 1 96 44 Z"
        className="mk-stroke-sage"
      />
    </svg>
  );
}

/** Step 03 — a week with a soft trend line across it. */
export function WeekArt() {
  return (
    <svg className="mk-step-art" viewBox="0 0 120 92" aria-hidden="true" focusable="false">
      <rect x="8" y="16" width="104" height="66" rx="10" className="mk-stroke-indigo" />
      <path d="M8 32 H112" className="mk-stroke-indigo mk-stroke-thin" opacity=".5" />
      <path d="M30 8 V20 M90 8 V20" className="mk-stroke-indigo mk-stroke-thin" />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${24 + i * 19} 40 V72`} className="mk-stroke-indigo mk-stroke-thin" opacity=".18" />
      ))}
      <path
        d="M16 66 C30 62 38 50 52 52 C66 54 72 42 86 40 C96 39 100 34 106 32"
        className="mk-stroke-sage"
        strokeLinecap="round"
      />
      <circle cx="106" cy="32" r="4" fill="var(--sage)" />
    </svg>
  );
}

/**
 * Mood sparkline — drawn once when it scrolls into view, captioned as an
 * illustration because the numbers are made up by the curve, not measured.
 */
export function MoodSparkline() {
  return (
    <svg
      className="mk-spark"
      viewBox="0 0 320 110"
      aria-hidden="true"
      focusable="false"
      data-draw
    >
      <path d="M8 96 H312" className="mk-spark-axis" />
      <path
        className="mk-spark-line"
        pathLength={1}
        d="M8 78 C34 74 46 88 70 80 C96 72 104 54 130 58 C156 62 164 44 190 46 C216 48 226 30 252 26 C276 22 296 30 312 22"
      />
      <circle cx="312" cy="22" r="4.5" fill="var(--sage)" />
    </svg>
  );
}
