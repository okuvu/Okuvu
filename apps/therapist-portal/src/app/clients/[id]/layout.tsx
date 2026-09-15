import PortalNav from "@/app/components/PortalNav";

// OKUVU brand kit (E99) — the old per-route top-bar.tsx (breadcrumb +
// avatar) is retired: the breadcrumb duplicated what every client
// sub-page already renders inline, and the avatar/sign-out role now
// lives in the one shared, portal-wide TopBar.
export default function ClientLayout({ children }: { children: React.ReactNode }) {
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
        <main className="p-4 md:p-8">
          {children}
        </main>
      </div>
    </>
  );
}
