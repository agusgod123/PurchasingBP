import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2, FileText } from "lucide-react";
import { requirePermission } from "@/server/auth/current";
import { PERMISSIONS } from "@/lib/permissions";
import { listMyRequests } from "@/server/queries/requests";
import { PageHeader, EmptyState } from "@/components/app/ui";
import { ListToolbar, Pager, QuickTabs } from "@/components/app/list-controls";
import { RequestTable } from "@/components/app/request-table";
import { Button } from "@/components/ui/button";
import { REQUEST_STATUS } from "@/lib/status";
import type { SearchParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Pengajuan Saya" };

export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission(PERMISSIONS.REQUEST_CREATE);
  const params = await searchParams;
  const data = await listMyRequests(user, params);
  const filtered = Object.keys(params).some((k) => ["q", "status", "from", "to", "tab"].includes(k));
  return (
    <>
      <PageHeader
        title="Pengajuan Saya"
        description="Pantau posisi setiap pengajuan tanpa perlu bertanya lewat chat."
        actions={
          <Button asChild>
            <Link href="/pengajuan/baru">
              <FilePlus2 className="size-4" /> Buat Pengajuan
            </Link>
          </Button>
        }
      />
      <QuickTabs
        tabs={[
          { value: "semua", label: "Semua", count: data.tabCounts.semua },
          { value: "tindakan", label: "Perlu tindakan saya", count: data.tabCounts.tindakan },
          { value: "aktif", label: "Sedang diproses", count: data.tabCounts.aktif },
          { value: "selesai", label: "Selesai", count: data.tabCounts.selesai },
          { value: "batal", label: "Dibatalkan", count: data.tabCounts.batal },
        ]}
      />
      <ListToolbar
        placeholder="Cari nomor, judul, atau barang…"
        dateRange
        filters={[
          {
            key: "status",
            label: "Status",
            options: Object.entries(REQUEST_STATUS).map(([value, s]) => ({ value, label: s.label })),
          },
        ]}
      />
      {data.rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={filtered ? "Tidak ada pengajuan yang cocok" : "Belum ada pengajuan"}
          description={filtered ? "Coba ubah kata kunci atau filter." : "Buat pengajuan pertama Anda — hanya butuh beberapa menit."}
          action={
            !filtered && (
              <Button asChild>
                <Link href="/pengajuan/baru">
                  <FilePlus2 className="size-4" /> Buat Pengajuan
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <RequestTable rows={data.rows} />
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} />
        </>
      )}
    </>
  );
}
