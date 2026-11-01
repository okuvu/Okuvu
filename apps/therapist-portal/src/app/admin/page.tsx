import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import TopBar from '@/app/components/TopBar';
import { AdminContent } from './_components/AdminContent';

/**
 * The operator console.
 *
 * Deliberately NOT wrapped in AuthenticatedShell: that shell renders the
 * therapist sidebar (caseload, schedule, per-client tabs), which is the wrong
 * navigation for an account that has no caseload by design. admin@okuvu.in is
 * an operator, not a clinician — giving it the clinician's chrome would imply
 * a caseload it does not have, and every link in that sidebar would 401.
 *
 * Access itself is decided twice on purpose: `auth()` here stops an anonymous
 * visitor, and `admin.amIAdmin` in AdminContent stops a signed-in therapist
 * who is not on ADMIN_EMAILS. The page renders for the latter so they get a
 * clear "restricted" panel instead of a bare 403 page.
 */
export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/auth');
  }

  return (
    <div className="min-h-screen bg-oat">
      <TopBar />
      <AdminContent />
    </div>
  );
}
