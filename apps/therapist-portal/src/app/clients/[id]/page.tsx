"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { maskPhone } from "@/lib/format";
import type { AssignmentState, CarePlanId, SafetyState } from "@evia/shared-types";
import PageHeader from "./_components/page-header";

function formatDate(raw: Date | string): string {
  const d = new Date(raw);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
      <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
        <span className="text-gray-400">{icon}</span>
        {title}
      </h2>
      {action}
    </div>
  );
}

function Badge({ variant }: { variant: AssignmentState }) {
  const isConfirmed = variant === "confirmed";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wide ${
        isConfirmed
          ? "bg-green-50 text-[#2D8A5E] border border-green-200"
          : "bg-amber-50 text-amber-700 border border-amber-200"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isConfirmed ? "bg-[#2D8A5E]" : "bg-amber-500"}`} />
      {isConfirmed ? "Confirmed" : "Provisional"}
    </span>
  );
}

// ─── Card Sections ───────────────────────────────────────────────────────

function CarePlanSection({
  carePlan,
  reasoningNote,
  assignmentState,
}: {
  carePlan: CarePlanId | null;
  reasoningNote: string | null;
  assignmentState: AssignmentState | null;
}) {
  return (
    <Card>
      <CardHeader
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        }
        title="Suggested Care Plan"
        action={assignmentState ? <Badge variant={assignmentState} /> : null}
      />
      <div className="p-5">
        {carePlan ? (
          <>
            <h3 className="text-lg font-semibold text-[#1A6B5A] leading-tight mb-1">
              {carePlan}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Recommended care plan for this client.
            </p>

            <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 mb-4">
              <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                Why Evia Suggested This
              </h4>
              {reasoningNote ? (
                <p className="text-sm text-gray-700 leading-relaxed">{reasoningNote}</p>
              ) : (
                <p className="text-sm text-gray-400 italic">Clinical reasoning not yet available.</p>
              )}
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                disabled
                className="flex-1 px-4 py-2 bg-[#1A6B5A] text-white rounded-lg text-sm font-medium opacity-50 cursor-not-allowed"
              >
                Confirm Plan
              </button>
              <button
                type="button"
                disabled
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed"
              >
                Modify Plan
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 px-5 py-8 text-center">
            <p className="text-sm font-medium text-gray-900">Not assigned</p>
            <p className="mt-1 text-xs text-gray-500">
              No care plan has been assigned to this client yet.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function SessionSummarySection({
  summaryText,
  status,
}: {
  summaryText: string | null;
  status: string;
}) {
  return (
    <Card>
      <CardHeader
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        }
        title="Latest Session Summary"
      />
      <div className="p-5">
        {status === "available" && summaryText ? (
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-4">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {summaryText}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 px-5 py-8 text-center">
            <p className="text-sm font-medium text-gray-900">Not yet available</p>
            <p className="mt-1 text-xs text-gray-500">
              The session summary will appear here once a session is completed and processed.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function RecentNotesSection({
  notes,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  clientId,
}: {
  notes: Array<{ id: string; note_text: string; created_at: string | Date; therapist: { name: string | null } }>;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  onRetry: () => void;
  clientId: string;
}) {
  return (
    <Card>
      <CardHeader
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        }
        title="Recent Notes"
        action={
          notes.length > 0 ? (
            <Link
              href={`/clients/${clientId}/notes`}
              className="text-xs font-medium text-[#1A6B5A] hover:underline"
            >
              View All
            </Link>
          ) : null
        }
      />
      <div className="p-5">
        {isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">Could not load notes.</p>
            <p className="mt-1 text-xs text-red-600">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : notes.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {notes.slice(0, 3).map((note) => (
              <div key={note.id} className="py-3 first:pt-0 last:pb-0 group">
                <div className="flex items-start justify-between mb-0.5">
                  <span className="text-[11px] text-gray-400 font-medium">
                    {formatDate(note.created_at)}
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-1">
                  {note.note_text}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 px-5 py-8 text-center">
            <p className="text-sm font-medium text-gray-900">No notes available yet</p>
            <p className="mt-1 text-xs text-gray-500">
              Clinical notes will appear here once added.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function SafetySection({ safetyState }: { safetyState: SafetyState | null }) {
  const isConcern = safetyState === "S2" || safetyState === "S3" || safetyState === "S4";
  const isStable = safetyState === "S0";
  const bgTint = isConcern ? "bg-amber-50" : "bg-white";

  return (
    <Card className={bgTint}>
      <CardHeader
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        }
        title="Safety Overview"
      />
      <div className="p-5">
        {safetyState ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-500">Current Status</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wide ${
                  isConcern
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : isStable
                    ? "bg-green-50 text-[#2D8A5E] border border-green-200"
                    : "bg-gray-100 text-gray-600 border border-gray-200"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isConcern ? "bg-amber-500" : isStable ? "bg-[#2D8A5E]" : "bg-gray-400"
                  }`}
                />
                {safetyState}
              </span>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-xs border-b border-gray-100 pb-2">
                <span className="text-gray-500">Self-Harm Ideation</span>
                <span className="text-gray-400">—</span>
              </div>
              <div className="flex justify-between items-center text-xs border-b border-gray-100 pb-2">
                <span className="text-gray-500">Substance Use</span>
                <span className="text-gray-400">—</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Last Assessment</span>
                <span className="text-gray-400">—</span>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 px-5 py-8 text-center">
            <p className="text-sm font-medium text-gray-900">No assessment</p>
            <p className="mt-1 text-xs text-gray-500">
              Safety assessment data is not yet available.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function ActivitySection() {
  return (
    <Card>
      <CardHeader
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        }
        title="Activity & Progress"
      />
      <div className="p-5">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
            <div className="text-2xl font-semibold text-gray-300 leading-none mb-1">—</div>
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Total Sessions</div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
            <div className="text-sm font-semibold text-gray-300 leading-tight mb-1">—</div>
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Last Session</div>
          </div>
        </div>
        <div>
          <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2.5">
            RECENT MOOD TRACKING
          </h4>
          <div className="flex gap-2 items-center">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-7 h-7 rounded-full border border-dashed border-gray-200 flex items-center justify-center text-gray-300"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 15s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
              </div>
            ))}
            <div className="h-px bg-gray-200 w-3" />
            <div
              className="w-7 h-7 rounded-full border border-dashed border-gray-200 flex items-center justify-center text-gray-300"
              title="Pending"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 italic">
            Mood tracking data not yet available.
          </p>
        </div>
      </div>
    </Card>
  );
}

function QuickActionsSection() {
  const actions = [
    {
      label: "Message Patient",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      ),
    },
    {
      label: "Schedule Appointment",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
  ];

  return (
    <Card>
      <div className="p-2 flex flex-col gap-0.5">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            disabled
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-gray-400 cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-300">
                {action.icon}
              </div>
              <span className="font-medium">{action.label}</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        ))}
      </div>
    </Card>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────

export default function ClientOverviewPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const detailQuery = trpc.clients.detail.useQuery(
    { clientUserId: clientId },
    { enabled: Boolean(clientId) },
  );

  const notesQuery = trpc.notes.listNotes.useQuery(
    { clientId },
    { enabled: Boolean(clientId) },
  );

  if (detailQuery.isLoading) {
    return (
      <div className="max-w-3xl">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-200 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 space-y-5">
            <div className="h-56 animate-pulse rounded-xl bg-white border border-gray-200 shadow-sm" />
            <div className="h-32 animate-pulse rounded-xl bg-white border border-gray-200 shadow-sm" />
          </div>
          <div className="lg:col-span-5 space-y-5">
            <div className="h-48 animate-pulse rounded-xl bg-white border border-gray-200 shadow-sm" />
            <div className="h-40 animate-pulse rounded-xl bg-white border border-gray-200 shadow-sm" />
          </div>
        </div>
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <section className="mx-auto w-full max-w-xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">
          Client Overview
        </h1>
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {detailQuery.error.message === "Client is not assigned to this therapist"
            ? "You are not assigned to this client."
            : detailQuery.error.message || "Could not load client details. Please try again."}
        </p>
        <button
          type="button"
          onClick={() => detailQuery.refetch()}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
        >
          Retry
        </button>
      </section>
    );
  }

  const client = detailQuery.data!;

  if (!client) {
    return (
      <section className="mx-auto w-full max-w-xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Client not found</h1>
        <p className="mt-2 text-sm text-gray-500">This client does not exist or has been removed.</p>
      </section>
    );
  }

  const carePlan = client.carePlan;
  const safetyState = client.safetyState;
  const summary = client.summary;
  const notes = notesQuery.data ?? [];
  const maskedPhone = maskPhone(client.phoneNumber);

  return (
    <>
      <PageHeader
        phoneNumber={maskedPhone}
        assignmentState={carePlan?.assignment_state ?? null}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 flex flex-col gap-5">
          <CarePlanSection
            carePlan={carePlan?.care_plan_id ?? null}
            reasoningNote={client.reasoningNote}
            assignmentState={carePlan?.assignment_state ?? null}
          />
          <SessionSummarySection
            summaryText={summary.summary_text}
            status={summary.status}
          />
          <RecentNotesSection
            notes={notes}
            isLoading={notesQuery.isLoading}
            isError={notesQuery.isError}
            errorMessage={notesQuery.error?.message ?? "Please try again."}
            onRetry={() => notesQuery.refetch()}
            clientId={clientId}
          />
        </div>

        <div className="lg:col-span-5 flex flex-col gap-5">
          <SafetySection safetyState={safetyState} />
          <ActivitySection />
          <QuickActionsSection />
        </div>
      </div>
    </>
  );
}
