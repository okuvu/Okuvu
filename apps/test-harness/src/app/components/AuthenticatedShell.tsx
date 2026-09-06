import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import Header from '@/app/components/Header';

export default async function AuthenticatedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect('/auth');
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex-1">{children}</div>
    </div>
  );
}
