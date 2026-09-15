'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatClientLabel } from '@/lib/format';
import { TabStrip } from '../_components/TabStrip';

// wireframes — "Tools" tab. A thin hub, not a merge: Homework and
// Reminders already have full pages with their own read/write logic;
// this just gives the tab strip a real destination for both.
export default function ClientToolsPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const clientLabel = formatClientLabel(clientId);

  return (
    <div className="min-h-screen bg-[#F4F6F8]">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-[#1A6B5A] transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <Link href={`/clients/${clientId}`} className="hover:text-[#1A6B5A] transition-colors">
              {clientLabel}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">Tools</span>
          </div>

          <TabStrip clientId={clientId} active="tools" />

          <Link
            href={`/clients/${clientId}/homework`}
            className="block rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200 hover:shadow-md transition text-center"
          >
            <span className="text-sm font-medium text-[#1A6B5A]">
              View and assign homework &rarr;
            </span>
            <p className="mt-1 text-xs text-gray-500">
              Assigned homework appears in the client&rsquo;s chat context.
            </p>
          </Link>

          <Link
            href={`/clients/${clientId}/reminders`}
            className="block rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-200 hover:shadow-md transition text-center"
          >
            <span className="text-sm font-medium text-[#1A6B5A]">
              View and schedule reminders &rarr;
            </span>
            <p className="mt-1 text-xs text-gray-500">
              Reminders appear on the client&rsquo;s Today card in the app.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
