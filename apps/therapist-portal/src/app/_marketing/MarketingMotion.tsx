'use client';

import { useEffect } from 'react';

/**
 * One observer for the whole marketing page, and the only JavaScript the
 * decoration needs.
 *
 *  - `[data-anim]` gets `data-inview="1"` while it is on screen. Every looping
 *    animation in marketing.css is paused unless its owner is in view, so the
 *    hero waves, the breathing blob, the glow and the orb cost nothing once
 *    they are scrolled past (or in a background tab, via `data-paused`).
 *  - `[data-draw]` gets `data-drawn="1"` the first time it is seen, and is then
 *    unobserved: the squiggle and the sparkline draw once, never re-run.
 *
 * Nothing here reads layout, so it cannot cause a reflow on scroll.
 */
export default function MarketingMotion() {
  useEffect(() => {
    const canvas = document.documentElement;
    const loops = Array.from(document.querySelectorAll<HTMLElement>('[data-anim]'));
    const draws = Array.from(document.querySelectorAll<HTMLElement>('[data-draw]'));

    if (typeof IntersectionObserver === 'undefined') {
      loops.forEach((el) => el.setAttribute('data-inview', '1'));
      draws.forEach((el) => el.setAttribute('data-drawn', '1'));
      return;
    }

    const loopObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.setAttribute('data-inview', entry.isIntersecting ? '1' : '0');
        }
      },
      { rootMargin: '80px 0px 80px 0px', threshold: 0 },
    );

    const drawObserver = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-drawn', '1');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.25 },
    );

    loops.forEach((el) => loopObserver.observe(el));
    draws.forEach((el) => drawObserver.observe(el));

    const onVisibility = () => {
      canvas.setAttribute('data-mk-paused', document.hidden ? '1' : '0');
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      loopObserver.disconnect();
      drawObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
