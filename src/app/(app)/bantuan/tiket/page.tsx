import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/current";
import { can } from "@/server/auth/user";
import { db } from "@/server/db";
import { EmptyState, PageHeader, PriorityBadge, StatusBadge } from "@/components/app/ui";
import { ListToolbar, Pager, QuickTabs } from "@/components/app/list-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/permissions";
import { TICKET_CATEGORY, TICKET_STATUS } from "@/lib/status";
import { formatRelative } from "@/lib/format";
import { pageParams, sp, type SearchParams } from "@/lib/list-params";
import { NewTicketDialog } from "./new-ticket-dialog";

export const metadata: Metadata = { title: "Tiket Bantuan" };

const OPEN_STATUSES = ["OPEN", "IN_PROGRESS", "FORWARDED"] as const;

export default async function TicketsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const params = await searchParams;
  const manager = can(user, PERMISSIONS.SUPPORT_MANAGE);
  const tab = sp(params, "tab") ?? "aktif";
  const q = sp(params, "q");
  const { page, pageSize, skip, take } = pageParams(params);

  const base: Prisma.SupportTicketWhereInput = manager ? (sp(params, "milik") === "saya" ? { assigneeId: user.id } : {}) : { reporterId: user.id };
  const where: Prisma.SupportTicketWhereInput = {
    ...base,
    ...(tab === "aktif" ? { status: { in: [...OPEN_STATUSES] } } : tab === "selesai" ? { status: { in: ["RESOLVED", "CLOSED"] } } : {}),
    ...(q
      ? {
          OR: [
            { ticketNumber: { contains: q, mode: "insensitive" } },
            { subject: { contains: q, mode: "insensitive" } },
            { reporter: { fullName: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total, activeCount] = await Promise.all([
    db.supportTicket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip,
      take,
      include: { reporter: { select: { fullName: true } }, assignee: { select: { fullName: true } }, _count: { select: { comments: true } } },
    }),
    db.supportTicket.count({ where }),
    db.supportTicket.count({ where: { ...base, status: { in: [...OPEN_STATUSES] } } }),
  ]);

  return (
    <>
      <PageHeader
        title="Tiket Bantuan"
        description={manager ? "Semua tiket dari pengguna. Tetapkan prioritas, penanggung jawab, lalu tutup setelah selesai." : "Laporkan kendala aplikasi atau tanyakan proses. Admin akan membalas di sini dan lewat notifikasi."}
        back={{ href: "/bantuan", label: "FAQ & Panduan" }}
        actions={<NewTicketDialog defaultOpen={sp(params, "baru") === "1"} />}
      />
      <QuickTabs
        tabs={[
          { value: "aktif", label: "Aktif", count: activeCount },
          { value: "selesai", label: "Selesai" },
          { value: "semua", label: "Semua" },
        ]}
      />
      <ListToolbar
        placeholder="Cari nomor, judul, atau pelapor…"
        filters={manager ? [{ key: "milik", label: "Penanggung jawab", options: [{ value: "saya", label: "Ditugaskan ke saya" }] }] : []}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title={tab === "aktif" ? "Tidak ada tiket aktif" : "Belum ada tiket"}
          description={manager ? undefined : "Cek FAQ terlebih dahulu — sebagian besar pertanyaan sudah terjawab di sana."}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tiket</TableHead>
                  <TableHead className="hidden md:table-cell">Kategori</TableHead>
                  {manager && <TableHead className="hidden lg:table-cell">Pelapor</TableHead>}
                  <TableHead className="hidden sm:table-cell">Prioritas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Diperbarui</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id} className="relative">
                    <TableCell className="max-w-0 min-w-56">
                      <Link href={`/bantuan/tiket/${t.id}`} className="block after:absolute after:inset-0">
                        <span className="block truncate font-medium">{t.subject}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.ticketNumber}
                          {t._count.comments > 0 && ` · ${t._count.comments} tanggapan`}
                          {manager && t.assignee && ` · ${t.assignee.fullName}`}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{TICKET_CATEGORY[t.category]}</TableCell>
                    {manager && <TableCell className="hidden text-sm lg:table-cell">{t.reporter.fullName}</TableCell>}
                    <TableCell className="hidden sm:table-cell">
                      <PriorityBadge priority={t.priority ?? t.urgency} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge {...TICKET_STATUS[t.status]} />
                    </TableCell>
                    <TableCell className="hidden text-right text-xs text-muted-foreground sm:table-cell">{formatRelative(t.updatedAt)}</TableCell>
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
