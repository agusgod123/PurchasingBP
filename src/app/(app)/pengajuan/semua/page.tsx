import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { requirePermission } from "@/server/auth/current";
import { PERMISSIONS } from "@/lib/permissions";
import { listAllRequests } from "@/server/queries/requests";
import { PageHeader, EmptyState } from "@/components/app/ui";
import { ListToolbar, Pager } from "@/components/app/list-controls";
import { RequestTable } from "@/components/app/request-table";
import { REQUEST_STATUS } from "@/lib/status";
import { db } from "@/server/db";
import type { SearchParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Semua Pengajuan" };

export default async function AllRequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission(PERMISSIONS.REQUEST_VIEW_SUMMARY_ALL);
  const params = await searchParams;
  const [data, departments] = await Promise.all([
    listAllRequests(user, params),
    db.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader
        title="Semua Pengajuan"
        description={
          data.showAmounts
            ? "Seluruh pengajuan lintas bagian."
            : "Ringkasan pengajuan lintas bagian. Detail dan dokumen hanya terbuka sesuai hak akses Anda."
        }
      />
      <ListToolbar
        placeholder="Cari nomor, judul, atau barang…"
        dateRange
        filters={[
          { key: "status", label: "Status", options: Object.entries(REQUEST_STATUS).filter(([v]) => v !== "DRAFT").map(([value, s]) => ({ value, label: s.label })) },
          { key: "department", label: "Bagian", options: departments.map((d) => ({ value: d.id, label: d.name })) },
        ]}
      />
      {data.rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Tidak ada pengajuan" description="Belum ada pengajuan yang sesuai filter." />
      ) : (
        <>
          <RequestTable rows={data.rows} showRequester showAmounts={data.showAmounts} dateField="submittedAt" />
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} />
        </>
      )}
    </>
  );
}
