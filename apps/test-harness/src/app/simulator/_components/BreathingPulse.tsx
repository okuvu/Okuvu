/**
 * The Simulator's one shared loading indicator — a slow 4s breathing pulse
 * (see globals.css's `breathing-pulse` keyframes), per
 * docs/design/EVIA_Mobile_Design.md's brand: calm, not a spinner. Replaces
 * three previously separate, copy-pasted CSS-spinner implementations
 * (LeftConfigPanel/ChatPane/ScenarioBattery).
 */
export default function BreathingPulse({ size = 14 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full bg-[var(--color-accent-marigold)]"
      style={{ width: size, height: size, animation: 'breathing-pulse 4s ease-in-out infinite' }}
      aria-hidden="true"
    />
  );
}
