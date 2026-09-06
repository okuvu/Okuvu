import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import { AdminContent } from './_components/AdminContent';

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/auth');
  }

  return (
    <AuthenticatedShell>
      <AdminContent />
    </AuthenticatedShell>
  );
}
