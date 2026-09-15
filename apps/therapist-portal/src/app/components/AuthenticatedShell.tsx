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
      <a
        href="#portal-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-violet focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <PortalNav />
      <div id="portal-content" tabIndex={-1} className="md:ml-[240px] min-h-screen bg-oat outline-none">
        {children}
      </div>
    </>
  );
}
