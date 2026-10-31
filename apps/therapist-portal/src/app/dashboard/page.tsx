import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import { isAdminEmail } from '@/lib/admin-allowlist';
import { prisma } from '@/lib/prisma';
import { DashboardContent } from './_components/DashboardContent';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/auth');
  }

  // The operator account (admin@okuvu.in) is on ADMIN_EMAILS and deliberately
  // has no Therapist row, so this page would render an empty caseload for it.
  // Send it where it can actually do something. The therapist lookup is exact
  // rather than assumed: an admin who also holds a caseload keeps their
  // dashboard, and only the caseload-less operator is redirected.
  if (isAdminEmail(session.user.email) && prisma) {
    const therapist = await prisma.therapist.findUnique({
      where: { email: session.user.email as string },
      select: { id: true },
    });
    if (!therapist) {
      redirect('/admin');
    }
  }

  return (
    <AuthenticatedShell>
      <DashboardContent therapistName={session.user.name ?? 'Therapist'} />
    </AuthenticatedShell>
  );
}
