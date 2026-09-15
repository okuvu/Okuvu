import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import { ScheduleContent } from './_components/ScheduleContent';

export default async function SchedulePage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/auth');
  }

  return (
    <AuthenticatedShell>
      <ScheduleContent />
    </AuthenticatedShell>
  );
}
