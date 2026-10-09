import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import { requirePermission } from "@/server/auth/current";
import { PERMISSIONS } from "@/lib/permissions";
import { listPurchaseOrders, vendorOptions } from "@/server/queries/purchasing";
import { EmptyState, Money, PageHeader, StatusBadge } from "@/components/app/ui";
import { ListToolbar, Pager, QuickTabs, SortHeader } from "@/components/app/list-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PO_STATUS } from "@/lib/status";
import { formatDate, formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SearchParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Pesanan (PO)" };

export default async function PoListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission(PERMISSIONS.PURCHASING_MANAGE);
  const params = await searchParams;
  const [data, vendors] = await Promise.all([listPurchaseOrders(params), vendorOptions()]);
  return (
    <>
      <PageHeader
        title="Pesanan (PO)"
        description="Transaksi pembelian ke vendor. Buat PO baru dari Antrean."
        actions={
          <Link href="/purchasing/antrean" className="text-sm font-medium text-primary hover:underline">
            Buka antrean →
          </Link>
        }
      />
      <QuickTabs
        tabs={[
          { value: "semua", label: "Semua", count: data.tabCounts.semua },
          { value: "proses", label: "Disiapkan", count: data.tabCounts.proses },
          { value: "pengiriman", label: "Dalam pengiriman", count: data.tabCounts.pengiriman },
          { value: "terlambat", label: "Terlambat", count: data.tabCounts.terlambat },
          { value: "diterima", label: "Siap ditutup", count: data.tabCounts.diterima },
          { value: "selesai", label: "Ditutup", count: data.tabCounts.selesai },
          { value: "batal", label: "Dibatalkan", count: data.tabCounts.batal },
        ]}
      />
      <ListToolbar
        placeholder="Cari nomor PO, vendor, atau nomor pengajuan…"
        filters={[
          { key: "status", label: "Status", options: Object.entries(PO_STATUS).map(([value, s]) => ({ value, label: s.label })) },
          { key: "vendor", label: "Vendor", options: vendors.map((v) => ({ value: v.id, label: v.name })) },
        ]}
      />
      {data.rows.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Tidak ada PO" description="Belum ada PO yang sesuai filter." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>
                    <SortHeader field="poNumber" label="Nomor" />
                  </TableHead>
                  <TableHead>Vendor / judul</TableHead>
                  <TableHead>Pengajuan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <SortHeader field="currentEta" label="ETA" />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader field="totalAmount" label="Nilai" className="ml-auto" />
                  </TableHead>
                  <TableHead>Petugas</TableHead>
                  <TableHead className="text-right">
                    <SortHeader field="updatedAt" label="Diperbarui" className="ml-auto" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((p) => {
                  const st = PO_STATUS[p.status];
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <Link href={`/purchasing/po/${p.id}`} className="hover:underline">
                          {p.poNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <div className="truncate">{p.vendor ?? <span className="text-muted-foreground">Vendor belum dipilih</span>}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {p.title ?? `${p.itemCount} baris`}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">{p.requestNumbers.join(", ")}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <StatusBadge label={st.label} tone={st.tone} />
                          {p.needsReview && <StatusBadge label="Perlu ditinjau" tone="warning" />}
                        </div>
                      </TableCell>
                      <TableCell className={cn("whitespace-nowrap text-sm", p.overdue && "font-medium text-red-600")}>
                        {p.overdue && <AlertTriangle className="mr-1 inline size-3.5" />}
                        {formatDateOnly(p.currentEta)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Money value={p.totalAmount} />
                      </TableCell>
                      <TableCell className="text-sm">{p.owner}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">{formatDate(p.updatedAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} />
        </>
      )}
    </>
  );
}
