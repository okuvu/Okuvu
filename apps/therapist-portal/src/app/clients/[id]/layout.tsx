'use client';

import { useParams } from "next/navigation";
import { trpc } from "@/trpc/client";
import { formatClientLabel } from "@/lib/format";
import Sidebar from "./_components/sidebar";
import TopBar from "./_components/top-bar";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const detailQuery = trpc.clients.detail.useQuery(
    { clientUserId: clientId },
    { enabled: Boolean(clientId) },
  );

  const clientLabel = detailQuery.data?.id
    ? formatClientLabel(detailQuery.data.id)
    : undefined;

  return (
    <>
      <Sidebar />
      <div className="md:ml-[240px] min-h-screen bg-[#F4F6F8]">
        <TopBar clientLabel={clientLabel} />
        <main className="p-4 md:p-8">
          {children}
        </main>
      </div>
    </>
  );
}
