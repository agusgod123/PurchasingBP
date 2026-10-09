import type { Metadata } from "next";
import { Store } from "lucide-react";
import { requirePermission } from "@/server/auth/current";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/server/db";
import { EmptyState, Money, PageHeader, StatusBadge } from "@/components/app/ui";
import { ListToolbar } from "@/components/app/list-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sp, type SearchParams } from "@/lib/list-params";
import { decStr, sum } from "@/server/money";
import { VendorDialog } from "./vendor-dialog";

export const metadata: Metadata = { title: "Vendor" };

export default async function VendorPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission(PERMISSIONS.VENDOR_MANAGE);
  const params = await searchParams;
  const q = sp(params, "q");
  const active = sp(params, "active");
  const contains = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const vendors = await db.vendor.findMany({
    where: {
      ...(contains ? { OR: [{ name: contains }, { code: contains }, { contactPerson: contains }] } : {}),
      ...(active ? { isActive: active === "1" } : {}),
    },
    include: { purchaseOrders: { where: { status: { not: "CANCELLED" } }, select: { totalAmount: true, status: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageHeader title="Vendor" description="Data vendor yang dibutuhkan untuk transaksi pembelian (bukan manajemen vendor penuh)." actions={<VendorDialog />} />
      <ListToolbar
        placeholder="Cari nama, kode, atau narahubung…"
        filters={[{ key: "active", label: "Status", options: [{ value: "1", label: "Aktif" }, { value: "0", label: "Nonaktif" }] }]}
      />
      {vendors.length === 0 ? (
        <EmptyState icon={Store} title="Belum ada vendor" description="Tambahkan vendor agar dapat dipilih pada PO dan penawaran." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Kode</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Kontak</TableHead>
                <TableHead className="text-right">Jumlah PO</TableHead>
                <TableHead className="text-right">Nilai PO</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.code}</TableCell>
                  <TableCell>{v.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{[v.contactPerson, v.phone, v.email].filter(Boolean).join(" · ") || "—"}</TableCell>
                  <TableCell className="text-right tabular">{v.purchaseOrders.length}</TableCell>
                  <TableCell className="text-right">
                    <Money value={decStr(sum(v.purchaseOrders.map((p) => p.totalAmount)))} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={v.isActive ? "Aktif" : "Nonaktif"} tone={v.isActive ? "success" : "neutral"} />
                  </TableCell>
                  <TableCell>
                    <VendorDialog
                      vendor={{
                        id: v.id,
                        code: v.code,
                        name: v.name,
                        contactPerson: v.contactPerson ?? "",
                        email: v.email ?? "",
                        phone: v.phone ?? "",
                        address: v.address ?? "",
                        taxNumber: v.taxNumber ?? "",
                        notes: v.notes ?? "",
                        isActive: v.isActive,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
