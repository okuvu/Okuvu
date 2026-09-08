import type { AssignmentState } from '@okuvu/shared-types';

interface PageHeaderProps {
  phoneNumber: string;
  assignmentState?: AssignmentState | null;
}

export default function PageHeader({ phoneNumber, assignmentState }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        {assignmentState && (
          <span className={`w-3 h-3 rounded-full ${assignmentState === 'confirmed' ? 'bg-[#2D8A5E]' : 'bg-amber-500'} flex-shrink-0`} />
        )}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 leading-tight">
            {phoneNumber}
          </h1>
        </div>
      </div>
      <div className="flex gap-2.5">
        <button
          type="button"
          disabled
          className="px-4 py-2 border border-gray-200 text-gray-400 rounded-lg text-xs font-medium cursor-not-allowed"
        >
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Report
          </span>
        </button>
        <button
          type="button"
          disabled
          className="px-4 py-2 bg-[#1A6B5A] text-white rounded-lg text-xs font-medium opacity-50 cursor-not-allowed"
        >
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Log Interaction
          </span>
        </button>
      </div>
    </div>
  );
}
