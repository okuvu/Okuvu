import PortalNav from "@/app/components/PortalNav";

// OKUVU brand kit (E99) — the old per-route top-bar.tsx (breadcrumb +
// avatar) is retired: the breadcrumb duplicated what every client
// sub-page already renders inline, and the avatar/sign-out role now
// lives in the one shared, portal-wide TopBar.
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PortalNav />
      <div className="md:ml-[240px] min-h-screen bg-oat">
        <main className="p-4 md:p-8">
          {children}
        </main>
      </div>
    </>
  );
}
