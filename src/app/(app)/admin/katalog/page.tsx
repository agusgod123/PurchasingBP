import type { Metadata } from "next";
import { Package } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { EmptyState, Money, PageHeader, StatusBadge } from "@/components/app/ui";
import { ListToolbar, Pager, QuickTabs } from "@/components/app/list-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/permissions";
import { pageParams, sp, type SearchParams } from "@/lib/list-params";
import { CatalogItemDialog, CategoryDialog } from "./catalog-client";

export const metadata: Metadata = { title: "Katalog Barang" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission(PERMISSIONS.CATALOG_MANAGE);
  const params = await searchParams;
  const tab = sp(params, "tab") ?? "barang";
  const categories = await db.itemCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { catalogItems: true } } } });
  const categoryOptions = categories.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }));

  let content: React.ReactNode;
  if (tab === "kategori") {
    content = (
      <>
        <div className="mb-4 flex justify-end">
          <CategoryDialog />
        </div>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kategori</TableHead>
                <TableHead className="hidden md:table-cell">Keterangan</TableHead>
                <TableHead className="text-right">Barang</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <span className="font-medium">{c.name}</span> <span className="text-xs text-muted-foreground">{c.code}</span>
                    {!c.isActive && <StatusBadge label="Nonaktif" className="ml-2" />}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{c.description ?? "—"}</TableCell>
                  <TableCell className="tabular text-right text-sm">{c._count.catalogItems}</TableCell>
                  <TableCell>
                    <CategoryDialog
                      category={{ id: c.id, code: c.code, name: c.name, description: c.description ?? "", sortOrder: String(c.sortOrder), isActive: c.isActive }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </>
    );
  } else {
    const q = sp(params, "q");
    const cat = sp(params, "kategori");
    const { page, pageSize, skip, take } = pageParams(params, 25);
    const where: Prisma.CatalogItemWhereInput = {
      ...(cat ? { categoryId: cat } : {}),
      ...(sp(params, "status") === "nonaktif" ? { isActive: false } : sp(params, "status") === "aktif" ? { isActive: true } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      db.catalogItem.findMany({ where, orderBy: [{ isActive: "desc" }, { name: "asc" }], skip, take, include: { category: true } }),
      db.catalogItem.count({ where }),
    ]);
    content = (
      <>
        <ListToolbar
          placeholder="Cari nama atau kode barang…"
          filters={[
            { key: "kategori", label: "Kategori", options: categoryOptions },
            { key: "status", label: "Status", options: [{ value: "aktif", label: "Aktif" }, { value: "nonaktif", label: "Nonaktif" }] },
          ]}
        >
          <CatalogItemDialog categories={categoryOptions} />
        </ListToolbar>
        {rows.length === 0 ? (
          <EmptyState icon={Package} title="Belum ada barang" description="Katalog membantu pemohon mengisi nama, spesifikasi, dan estimasi harga yang seragam." />
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Barang</TableHead>
                    <TableHead className="hidden md:table-cell">Kategori</TableHead>
                    <TableHead className="hidden sm:table-cell">Satuan</TableHead>
                    <TableHead className="text-right">Estimasi harga</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((i) => (
                    <TableRow key={i.id} className={i.isActive ? undefined : "opacity-60"}>
                      <TableCell className="max-w-0 min-w-52">
                        <span className="block truncate font-medium">{i.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{[i.code, i.description].filter(Boolean).join(" · ") || "—"}</span>
                      </TableCell>
                      <TableCell className="hidden text-sm md:table-cell">{i.category.name}</TableCell>
                      <TableCell className="hidden text-sm sm:table-cell">{i.unitName}</TableCell>
                      <TableCell className="text-right text-sm">{i.defaultEstimatedPrice ? <Money value={i.defaultEstimatedPrice} /> : "—"}</TableCell>
                      <TableCell>
                        <CatalogItemDialog
                          categories={categoryOptions}
                          item={{
                            id: i.id,
                            categoryId: i.categoryId,
                            code: i.code ?? "",
                            name: i.name,
                            description: i.description ?? "",
                            itemType: i.itemType,
                            unitName: i.unitName,
                            defaultEstimatedPrice: i.defaultEstimatedPrice ? i.defaultEstimatedPrice.toFixed(0) : "",
                            isActive: i.isActive,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </>
    );
  }
  return (
    <>
      <PageHeader title="Katalog Barang" description="Daftar barang standar untuk mempercepat pengisian pengajuan. Pemohon tetap dapat mengisi barang di luar katalog." />
      <QuickTabs
        tabs={[
          { value: "barang", label: "Barang" },
          { value: "kategori", label: "Kategori", count: categories.length },
        ]}
      />
      {content}
    </>
  );
}
