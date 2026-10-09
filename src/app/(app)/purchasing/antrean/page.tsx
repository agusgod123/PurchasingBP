import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { requirePermission } from "@/server/auth/current";
import { PERMISSIONS } from "@/lib/permissions";
import { purchasingQueue, vendorOptions } from "@/server/queries/purchasing";
import { EmptyState, PageHeader } from "@/components/app/ui";
import { ListToolbar } from "@/components/app/list-controls";
import { db } from "@/server/db";
import type { SearchParams } from "@/lib/list-params";
import { QueueBoard } from "./queue-board";

export const metadata: Metadata = { title: "Antrean Purchasing" };

export default async function QueuePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission(PERMISSIONS.PURCHASING_MANAGE);
  const params = await searchParams;
  const [queue, vendors, departments] = await Promise.all([
    purchasingQueue(params),
    vendorOptions(),
    db.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const itemCount = queue.reduce((a, r) => a + r.items.length, 0);
  return (
    <>
      <PageHeader
        title="Antrean Purchasing"
        description={`${queue.length} pengajuan · ${itemCount} item menunggu dibelikan. Diurutkan berdasarkan prioritas final, tanggal dibutuhkan, lalu urutan masuk. Centang item (boleh lintas pengajuan) untuk dibuat PO.`}
      />
      <ListToolbar
        placeholder="Cari nomor, judul, atau barang…"
        filters={[{ key: "department", label: "Bagian", options: departments.map((d) => ({ value: d.id, label: d.name })) }]}
      />
      {queue.length === 0 ? (
        <EmptyState icon={Inbox} title="Antrean kosong" description="Pengajuan yang sudah disetujui akan otomatis masuk ke sini." />
      ) : (
        <QueueBoard queue={queue} vendors={vendors} />
      )}
    </>
  );
}
