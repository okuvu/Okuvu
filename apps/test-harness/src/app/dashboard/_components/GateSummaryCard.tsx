import DashboardRow from '@/app/components/DashboardRow';
import ClinicalNoticePanel from '@/app/components/ClinicalNoticePanel';

export interface GateSummaryEntry {
  gate: string;
  approvedCount: number;
  rejectedCount: number;
  mostRecentDecision: {
    decision: 'APPROVED' | 'REJECTED';
    signed_by: string;
    signed_at: string | Date;
  } | null;
}

export interface ConfigDrift {
  hasPin: boolean;
  drifted: boolean;
  prod: { provider: string; modelVersion: string; temperature: number };
  pinned: {
    provider: string;
    modelVersion: string;
    temperature: number;
    pinnedBy: string;
    createdAt: string | Date;
  } | null;
}

export default function GateSummaryCard({
  gates,
  configDrift,
}: {
  gates: GateSummaryEntry[];
  configDrift: ConfigDrift;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)] shadow-[var(--shadow-soft)]">
      <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
        Gate sign-offs
      </h2>

      {configDrift.drifted ? (
        <div className="mt-4">
          <ClinicalNoticePanel variant="warning" title="Config drift detected">
            The pinned model configuration no longer matches production defaults.
            <div className="mt-2 grid grid-cols-2 gap-2 text-[var(--text-label-sm)]">
              <div>
                <div className="font-semibold">Production (current defaults)</div>
                <div>Provider: {configDrift.prod.provider}</div>
                <div>Model: {configDrift.prod.modelVersion}</div>
                <div>Temperature: {configDrift.prod.temperature}</div>
              </div>
              <div>
                <div className="font-semibold">Pinned config</div>
                <div>Provider: {configDrift.pinned?.provider ?? '—'}</div>
                <div>Model: {configDrift.pinned?.modelVersion ?? '—'}</div>
                <div>Temperature: {configDrift.pinned?.temperature ?? '—'}</div>
              </div>
            </div>
          </ClinicalNoticePanel>
        </div>
      ) : null}

      {!configDrift.hasPin ? (
        <div className="mt-4">
          <ClinicalNoticePanel variant="info" title="No model config pinned">
            No <code>ModelConfigPin</code> has been recorded yet for this environment, so
            drift cannot be evaluated.
          </ClinicalNoticePanel>
        </div>
      ) : null}

      <div className="mt-4 divide-y divide-[var(--color-outline-variant)]">
        {gates.length === 0 ? (
          <p className="py-2 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            No gate sign-offs recorded yet.
          </p>
        ) : (
          gates.map((entry) => (
            <DashboardRow
              key={entry.gate}
              label={entry.gate}
              value={
                <span className="flex items-center gap-3">
                  <span className="text-emerald-700">{entry.approvedCount} approved</span>
                  <span className="text-red-700">{entry.rejectedCount} rejected</span>
                  {entry.mostRecentDecision ? (
                    <span className="text-[var(--color-on-surface-variant)]">
                      last: {entry.mostRecentDecision.decision} by{' '}
                      {entry.mostRecentDecision.signed_by}
                    </span>
                  ) : null}
                </span>
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
