import Link from 'next/link';
import type { ClientListItem } from '@evia/shared-types';

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `••• ••• ${digits.slice(-4)}`;
}

function formatLastSession(iso: string | null): string {
  if (!iso) return 'No sessions yet';
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCarePlan(carePlan: ClientListItem['carePlan']): string {
  if (!carePlan) return 'Not assigned';
  return `${carePlan.care_plan_id} · ${carePlan.assignment_state}`;
}

export function ClientRow({ client }: { client: ClientListItem }) {
  return (
    <Link
      href={`/clients/${client.id}`}
      className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-5 py-4 transition hover:border-gray-300 hover:bg-gray-50"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">
          {maskPhone(client.phoneNumber)}
        </div>
        <div className="mt-1 text-xs text-gray-500">
          {formatCarePlan(client.carePlan)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-xs uppercase tracking-wide text-gray-400">
          Last session
        </div>
        <div className="mt-0.5 text-sm text-gray-700">
          {formatLastSession(client.lastSessionDate)}
        </div>
      </div>
    </Link>
  );
}