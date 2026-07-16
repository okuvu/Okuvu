import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import { DashboardContent } from './_components/DashboardContent';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/auth');
  }

  return (
    <AuthenticatedShell>
      <DashboardContent therapistName={session.user.name ?? 'Therapist'} />
    </AuthenticatedShell>
  );
}
