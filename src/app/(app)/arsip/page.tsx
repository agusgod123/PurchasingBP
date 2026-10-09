import type { Metadata } from "next";
import Link from "next/link";
import { Download, FolderArchive } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import type { DocumentType } from "@/generated/prisma/enums";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { addDays, zonedMidnight } from "@/server/time";
import { EmptyState, PageHeader } from "@/components/app/ui";
import { ListToolbar, Pager } from "@/components/app/list-controls";
import { FileIcon } from "@/components/app/documents-panel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/permissions";
import { DOCUMENT_TYPE } from "@/lib/status";
import { formatBytes, formatDateTime } from "@/lib/format";
import { dateRangeParams, pageParams, sp, type SearchParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Arsip Dokumen" };

export default async function ArchivePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission(PERMISSIONS.DOCUMENT_VIEW_ALL);
  const params = await searchParams;
  const q = sp(params, "q");
  const type = sp(params, "jenis") as DocumentType | undefined;
  const { from, to } = dateRangeParams(params);
  const { page, pageSize, skip, take } = pageParams(params, 25);

  const where: Prisma.DocumentWhereInput = {
    deletedAt: null,
    uploadStatus: "READY",
    ...(type && type in DOCUMENT_TYPE ? { documentType: type } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: zonedMidnight(from) } : {}), ...(to ? { lt: addDays(zonedMidnight(to), 1) } : {}) } }
      : {}),
    ...(q
      ? {
          OR: [
            { originalFilename: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { request: { requestNumber: { contains: q, mode: "insensitive" } } },
            { handover: { request: { requestNumber: { contains: q, mode: "insensitive" } } } },
            { purchaseOrder: { poNumber: { contains: q, mode: "insensitive" } } },
            { vendorQuote: { purchaseOrder: { poNumber: { contains: q, mode: "insensitive" } } } },
            { goodsReceipt: { purchaseOrder: { poNumber: { contains: q, mode: "insensitive" } } } },
            { goodsReceipt: { receiptNumber: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        uploadedBy: { select: { fullName: true } },
        request: { select: { id: true, requestNumber: true, title: true } },
        handover: { select: { handoverNumber: true, request: { select: { id: true, requestNumber: true } } } },
        purchaseOrder: { select: { id: true, poNumber: true } },
        vendorQuote: { select: { vendor: { select: { name: true } }, purchaseOrder: { select: { id: true, poNumber: true } } } },
        goodsReceipt: { select: { receiptNumber: true, purchaseOrder: { select: { id: true, poNumber: true } } } },
        discrepancy: { select: { purchaseOrder: { select: { id: true, poNumber: true } } } },
      },
    }),
    db.document.count({ where }),
  ]);

  const context = (d: (typeof rows)[number]): { href: string; label: string; sub?: string } | null => {
    if (d.request) return { href: `/pengajuan/${d.request.id}`, label: d.request.requestNumber ?? "Draf", sub: d.request.title };
    if (d.handover) return { href: `/pengajuan/${d.handover.request.id}`, label: d.handover.request.requestNumber ?? "—", sub: d.handover.handoverNumber };
    if (d.purchaseOrder) return { href: `/purchasing/po/${d.purchaseOrder.id}`, label: d.purchaseOrder.poNumber };
    if (d.vendorQuote) return { href: `/purchasing/po/${d.vendorQuote.purchaseOrder.id}`, label: d.vendorQuote.purchaseOrder.poNumber, sub: d.vendorQuote.vendor.name };
    if (d.goodsReceipt) return { href: `/purchasing/po/${d.goodsReceipt.purchaseOrder.id}`, label: d.goodsReceipt.purchaseOrder.poNumber, sub: d.goodsReceipt.receiptNumber };
    if (d.discrepancy) return { href: `/purchasing/po/${d.discrepancy.purchaseOrder.id}`, label: d.discrepancy.purchaseOrder.poNumber, sub: "Masalah barang" };
    return null;
  };

  return (
    <>
      <PageHeader
        title="Arsip Dokumen"
        description="Semua dokumen pengajuan, penawaran, pemesanan, penerimaan, dan serah terima di satu tempat. Setiap unduhan tercatat di audit log."
      />
      <ListToolbar
        placeholder="Cari nama file, no. pengajuan, PO, atau GR…"
        dateRange
        filters={[{ key: "jenis", label: "Jenis", options: Object.entries(DOCUMENT_TYPE).map(([value, label]) => ({ value, label })) }]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={FolderArchive} title="Tidak ada dokumen" description="Ubah filter atau kata kunci pencarian." />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dokumen</TableHead>
                  <TableHead>Terkait</TableHead>
                  <TableHead className="hidden lg:table-cell">Diunggah oleh</TableHead>
                  <TableHead className="hidden md:table-cell">Tanggal</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => {
                  const c = context(d);
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="max-w-0 min-w-56">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5">
                            <FileIcon mime={d.mimeType} />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-medium" title={d.originalFilename}>
                              {d.originalFilename}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {DOCUMENT_TYPE[d.documentType]} · {formatBytes(d.sizeBytes)}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c ? (
                          <Link href={c.href} className="group block">
                            <span className="font-medium text-primary group-hover:underline">{c.label}</span>
                            {c.sub && <span className="block max-w-56 truncate text-xs text-muted-foreground">{c.sub}</span>}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">{d.uploadedBy.fullName}</TableCell>
                      <TableCell className="hidden text-sm whitespace-nowrap text-muted-foreground md:table-cell">{formatDateTime(d.createdAt)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" asChild aria-label={`Unduh ${d.originalFilename}`}>
                          <a href={`/api/files/${d.id}`}>
                            <Download className="size-4" />
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pager page={page} pageSize={pageSize} total={total} />
        </>
      )}
    </>
  );
}
