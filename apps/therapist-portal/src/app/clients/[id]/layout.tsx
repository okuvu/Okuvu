'use client';

import { useParams } from "next/navigation";
import { trpc } from "@/trpc/client";
import { maskPhone } from "@/lib/format";
import Sidebar from "./_components/sidebar";
import TopBar from "./_components/top-bar";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const detailQuery = trpc.clients.detail.useQuery(
    { clientUserId: clientId },
    { enabled: Boolean(clientId) },
  );

  const maskedPhone = detailQuery.data?.phoneNumber
    ? maskPhone(detailQuery.data.phoneNumber)
    : undefined;

  return (
    <>
      <Sidebar />
      <div className="md:ml-[240px] min-h-screen bg-[#F4F6F8]">
        <TopBar clientLabel={maskedPhone} />
        <main className="p-4 md:p-8">
          {children}
        </main>
      </div>
    </>
  );
}
