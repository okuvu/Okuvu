function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined leading-none ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

/**
 * Shared panel-title treatment for the Simulator's five top-level sections
 * (Scenario, Conversation, What happened, Scenario battery, Corpus cases) —
 * a Fraunces heading with a soft teal icon badge, replacing the small
 * all-caps tracked-wide label style that made every panel look identical to
 * every sub-section and gave the page no visual hierarchy.
 */
export default function PanelHeader({
  icon,
  action,
  children,
}: {
  icon: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2
        className="flex items-center gap-2 text-[17px] leading-none text-[var(--color-on-surface)]"
        style={{ fontFamily: 'var(--font-heading-serif)', fontWeight: 600 }}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-container)]/15 text-[var(--color-primary)]">
          <Icon name={icon} className="text-[16px]" />
        </span>
        {children}
      </h2>
      {action}
    </div>
  );
}
