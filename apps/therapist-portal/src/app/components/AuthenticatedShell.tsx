import Sidebar from '@/app/clients/[id]/_components/sidebar';

export default function AuthenticatedShell({
  children,
  clientName,
}: {
  children: React.ReactNode;
  clientName?: string;
}) {
  return (
    <>
      <Sidebar clientName={clientName} />
      <div className="md:ml-[240px] min-h-screen bg-[#F4F6F8]">
        {children}
      </div>
    </>
  );
}
