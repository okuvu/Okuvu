import PortalNav from '@/app/components/PortalNav';

// OKUVU brand kit (E99) — TopBar is now the one portal-wide chrome bar,
// replacing both this shell's old mobile-only wordmark/sign-out bar and
// the redundant copy that used to live in clients/[id]/_components/top-bar.tsx.
export default function AuthenticatedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PortalNav />
      <div className="md:ml-[240px] min-h-screen bg-oat">
        {children}
      </div>
    </>
  );
}
