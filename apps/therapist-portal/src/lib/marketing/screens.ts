import type { StaticImageData } from 'next/image';

/**
 * Where the real screenshots go.
 *
 * Every slot is null today: the app screens have not been photographed in a
 * state we would put on a public page, and a made-up screenshot would be a
 * claim. A null slot renders <ScreenSlot>'s drawn illustration instead —
 * shapes only, no words, no invented data — captioned "Illustration".
 *
 * To put a real screenshot in, import the file and assign it. One line per
 * slot, nothing else to change:
 *
 *   import chatShot from '../../public/marketing/chat.png';
 *   ...
 *   chat: chatShot,
 *
 * A static import is preferred over a string path: next/image then knows the
 * real width and height (no layout shift) and can generate a blur placeholder.
 * A string path like '/marketing/chat.png' also works, and needs `sizes` on the
 * <ScreenSlot> — see the component.
 */
export type ScreenName = 'chat' | 'mood' | 'journal' | 'breathing' | 'appointments' | 'portal';

export type ScreenSource = StaticImageData | string | null;

export const screens: Record<ScreenName, ScreenSource> = {
  chat: null,
  mood: null,
  journal: null,
  breathing: null,
  appointments: null,
  portal: null,
};

export function screenFor(name: ScreenName): ScreenSource {
  return screens[name];
}
