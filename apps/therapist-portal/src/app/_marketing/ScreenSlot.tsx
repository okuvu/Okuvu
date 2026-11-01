import Image from 'next/image';
import { copy } from '@/lib/marketing/copy';
import { screens, type ScreenName } from '@/lib/marketing/screens';

/**
 * One slot per app screen.
 *
 * Until a real screenshot exists in `screens.ts`, this draws the screen as
 * shapes: solid cards and bubbles, indigo outlines, and soft grey bars where
 * words would be. No fake copy, no invented numbers — the caption says
 * "Illustration" and the alt text says what is drawn. The page's own claim is
 * that nothing on it is on a roadmap, so nothing here implies an unbuilt
 * feature either: each illustration stands for a screen that ships today.
 *
 * With a path set, the slot renders next/image inside a fixed aspect ratio, so
 * swapping in a screenshot later is one line in screens.ts and no layout shift.
 */

type Variant = 'phone' | 'laptop' | 'card';

const VARIANT: Record<ScreenName, Variant> = {
  chat: 'phone',
  journal: 'card',
  appointments: 'card',
  mood: 'card',
  breathing: 'card',
  portal: 'laptop',
};

function PhoneIllustration() {
  // conversation
  return (
    <svg viewBox="0 0 180 300" aria-hidden="true" focusable="false">
      <rect x="28" y="26" width="70" height="6" rx="3" className="mk-fill-bar" opacity="0.5" />
      <g className="mk-outline-indigo">
        <rect x="14" y="52" width="112" height="46" rx="16" className="mk-fill-lavender" />
        <rect x="14" y="108" width="88" height="34" rx="16" className="mk-fill-lavender" />
        <rect x="52" y="154" width="114" height="52" rx="16" className="mk-fill-sage" />
        <rect x="52" y="216" width="82" height="34" rx="16" className="mk-fill-sage" />
      </g>
      <g className="mk-fill-bar">
        <rect x="28" y="66" width="76" height="7" rx="3.5" />
        <rect x="28" y="80" width="52" height="7" rx="3.5" opacity="0.7" />
        <rect x="28" y="120" width="58" height="7" rx="3.5" opacity="0.8" />
        <rect x="66" y="170" width="80" height="7" rx="3.5" />
        <rect x="66" y="184" width="56" height="7" rx="3.5" opacity="0.75" />
        <rect x="66" y="228" width="50" height="7" rx="3.5" opacity="0.8" />
      </g>
      <rect x="14" y="264" width="152" height="26" rx="13" className="mk-fill-stone mk-outline-indigo" />
      <rect x="26" y="274" width="54" height="6" rx="3" className="mk-fill-bar" opacity="0.6" />
    </svg>
  );
}

function CardIllustration({ name }: { name: ScreenName }) {
  if (name === 'journal') {
    return (
      <svg viewBox="0 0 320 190" aria-hidden="true" focusable="false">
        <rect x="16" y="16" width="288" height="158" rx="18" className="mk-fill-stone mk-outline-indigo" />
        <rect x="36" y="36" width="74" height="7" rx="3.5" className="mk-fill-bar" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect
            key={i}
            x="36"
            y={60 + i * 18}
            width={i % 3 === 2 ? 132 : 216}
            height="6"
            rx="3"
            className="mk-fill-bar"
            opacity={i % 3 === 2 ? 0.45 : 0.75}
          />
        ))}
        <circle cx="276" cy="42" r="12" className="mk-fill-sage mk-outline-indigo" />
        <path d="M271 42 v-4.5 a5 5 0 0 1 10 0 v4.5" fill="none" className="mk-stroke-indigo-thin" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === 'appointments') {
    return (
      <svg viewBox="0 0 320 190" aria-hidden="true" focusable="false">
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect
              x="16"
              y={18 + i * 56}
              width="288"
              height="44"
              rx="14"
              className={i === 0 ? 'mk-fill-sage mk-outline-indigo' : 'mk-fill-stone mk-outline-indigo'}
            />
            <rect x="30" y={30 + i * 56} width="22" height="20" rx="6" className="mk-fill-lavender mk-outline-indigo" />
            <rect x="66" y={32 + i * 56} width={i === 0 ? 120 : 92} height="7" rx="3.5" className="mk-fill-bar" />
            <rect x="66" y={44 + i * 56} width="58" height="6" rx="3" className="mk-fill-bar" opacity="0.55" />
            <circle cx="282" cy={40 + i * 56} r="7" className="mk-outline-indigo" fill="none" />
          </g>
        ))}
      </svg>
    );
  }

  if (name === 'breathing') {
    return (
      <svg viewBox="0 0 320 190" aria-hidden="true" focusable="false">
        <circle cx="160" cy="95" r="58" className="mk-outline-indigo" fill="none" />
        <circle cx="160" cy="95" r="38" className="mk-fill-sage" opacity="0.55" />
        <circle cx="160" cy="95" r="18" className="mk-fill-sage" />
      </svg>
    );
  }

  // mood
  return (
    <svg viewBox="0 0 320 190" aria-hidden="true" focusable="false">
      <rect x="16" y="18" width="288" height="154" rx="18" className="mk-fill-stone mk-outline-indigo" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect key={i} x={48 + i * 34} y={120 - i * 6} width="12" height={i * 6 + 22} rx="6" className="mk-fill-sage" opacity={0.45 + i * 0.08} />
      ))}
      <rect x="34" y="32" width="72" height="7" rx="3.5" className="mk-fill-bar" />
    </svg>
  );
}

function LaptopIllustration() {
  return (
    <svg viewBox="0 0 340 210" aria-hidden="true" focusable="false">
      <rect x="10" y="14" width="72" height="182" rx="12" className="mk-fill-lavender mk-outline-indigo" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x="22" y={34 + i * 26} width={i === 0 ? 46 : 34} height="8" rx="4" className="mk-fill-bar" opacity={i === 0 ? 0.9 : 0.5} />
      ))}
      <rect x="94" y="14" width="236" height="98" rx="14" className="mk-fill-stone mk-outline-indigo" />
      <rect x="108" y="30" width="86" height="8" rx="4" className="mk-fill-bar" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx="120" cy={60 + i * 18} r="6" className="mk-fill-sage" />
          <rect x="134" y={56 + i * 18} width={i === 0 ? 96 : 70} height="7" rx="3.5" className="mk-fill-bar" opacity="0.65" />
        </g>
      ))}
      <rect x="94" y="122" width="236" height="74" rx="14" className="mk-fill-stone mk-outline-indigo" />
      <rect x="108" y="136" width="62" height="7" rx="3.5" className="mk-fill-bar" opacity="0.8" />
      <rect x="108" y="152" width="180" height="7" rx="3.5" className="mk-fill-bar" opacity="0.5" />
      <rect x="108" y="168" width="140" height="7" rx="3.5" className="mk-fill-bar" opacity="0.4" />
    </svg>
  );
}

export default function ScreenSlot({
  name,
  priority = false,
}: {
  name: ScreenName;
  priority?: boolean;
}) {
  const source = screens[name];
  const variant = VARIANT[name];
  const alt = copy.art.screenAlt[name];

  return (
    <figure className={`mk-slot mk-slot--${variant}`}>
      <div className={`mk-frame mk-frame--${variant}`}>
        {source ? (
          <div className="mk-frame-screen">
            <Image
              src={source}
              alt={alt}
              fill
              sizes={variant === 'laptop' ? '(max-width: 900px) 88vw, 520px' : '(max-width: 900px) 70vw, 320px'}
              priority={priority}
              style={{ objectFit: 'cover' }}
            />
          </div>
        ) : (
          <div className="mk-frame-screen" role="img" aria-label={alt}>
            {variant === 'phone' && <PhoneIllustration />}
            {variant === 'card' && <CardIllustration name={name} />}
            {variant === 'laptop' && <LaptopIllustration />}
          </div>
        )}
        {variant === 'laptop' && <span className="mk-frame-base" aria-hidden="true" />}
      </div>
      {!source && <figcaption className="mk-slot-caption">{copy.art.illustration}</figcaption>}
    </figure>
  );
}
