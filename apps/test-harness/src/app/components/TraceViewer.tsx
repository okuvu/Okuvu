'use client';

import { useMemo, useState } from 'react';

export default function TraceViewer({
  data,
  title = 'Trace',
  defaultExpanded = false,
}: {
  data: unknown;
  title?: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  // Defer the expensive JSON.stringify (and any future syntax highlighting)
  // until the panel is actually expanded — avoids formatting large trace
  // payloads on every render while the panel stays collapsed.
  const json = useMemo(() => {
    if (!expanded) return '';
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data, expanded]);

  const handleCopy = async () => {
    try {
      // Compute on demand so copying works even while collapsed (json is
      // only populated when expanded, to avoid stringifying eagerly).
      const text = expanded
        ? json
        : (() => {
            try {
              return JSON.stringify(data, null, 2);
            } catch {
              return String(data);
            }
          })();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)]">
      {/* IBM Plex Mono loaded here only — used exclusively for this monospace JSON display. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap"
      />
      <div className="flex items-center justify-between border-b border-[var(--color-outline-variant)] px-[var(--spacing-md)] py-[var(--spacing-sm)]">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface)]"
          aria-expanded={expanded}
        >
          <span
            className={`inline-block transition-transform ${expanded ? 'rotate-90' : 'rotate-0'}`}
            aria-hidden="true"
          >
            &#9656;
          </span>
          {title}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-[var(--radius-lg)] px-2 py-1 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)] transition-colors hover:bg-[var(--color-surface-container-high)] hover:text-[var(--color-on-surface)]"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {expanded ? (
        <pre
          className="max-h-[480px] overflow-auto p-[var(--spacing-md)] text-xs leading-relaxed text-[var(--color-on-surface)]"
          style={{ fontFamily: '"IBM Plex Mono", monospace' }}
        >
          {json}
        </pre>
      ) : null}
    </div>
  );
}
