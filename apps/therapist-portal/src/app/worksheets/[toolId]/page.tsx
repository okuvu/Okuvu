'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { trpc } from '@/trpc/client';
import { WorksheetRunner } from '../_components/WorksheetRunner';
import type { WorksheetContent } from '@okuvu/shared-types/worksheet';

/**
 * One worksheet, previewed exactly as the client sees it.
 *
 * A worksheet whose body does not validate is shown with its problems listed
 * and the runner withheld: the therapist needs to see the refusal, not a
 * half-rendered worksheet that would break for the client.
 */
export default function WorksheetPreviewPage() {
  const params = useParams<{ toolId: string }>();
  const toolId = params.toolId;
  const { data, isLoading, error } = trpc.worksheets.preview.useQuery({ toolId });

  return (
    <div className="min-h-screen bg-oat">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/worksheets" className="hover:text-royal-purple transition-colors">
              Worksheets
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">{data?.label ?? toolId}</span>
          </div>

          {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error.message}
            </p>
          )}

          {data && (
            <>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-gray-900">{data.label}</h1>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      data.status === 'approved'
                        ? 'bg-sage-tint text-sage-deep'
                        : data.status === 'retired'
                          ? 'bg-gray-100 text-gray-500'
                          : 'bg-honey-tint text-honey-deep'
                    }`}
                  >
                    {data.status}
                  </span>
                </div>
                {data.summary && <p className="text-sm text-gray-600">{data.summary}</p>}
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
                  {data.modality && (
                    <div className="flex gap-1">
                      <dt>Approach:</dt>
                      <dd className="text-gray-700">{data.modality}</dd>
                    </div>
                  )}
                  <div className="flex gap-1">
                    <dt>Opens:</dt>
                    <dd className="text-gray-700">{data.accessMode}</dd>
                  </div>
                  {data.loadLevel && (
                    <div className="flex gap-1">
                      <dt>Load:</dt>
                      <dd className="text-gray-700">{data.loadLevel}</dd>
                    </div>
                  )}
                  {data.estMinutes != null && (
                    <div className="flex gap-1">
                      <dt>About:</dt>
                      <dd className="text-gray-700">{data.estMinutes} min</dd>
                    </div>
                  )}
                </dl>
              </div>

              {data.problems.length > 0 ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-800">
                    This worksheet cannot be served to a client until these are fixed
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-red-700">
                    {data.problems.map((problem: string) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-2xl border border-hairline bg-oat-elevated p-4 md:p-6">
                  <WorksheetRunner
                    content={data.content as WorksheetContent}
                    hingeContent={(data.hingeContent as WorksheetContent | null) ?? null}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
