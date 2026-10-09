import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { addDays, zonedMidnight } from "@/server/time";
import { EmptyState, PageHeader } from "@/components/app/ui";
import { ListToolbar, Pager } from "@/components/app/list-controls";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { dateRangeParams, pageParams, sp, type SearchParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Audit Log" };

const ENTITY_LABEL: Record<string, string> = {
  request: "Pengajuan",
  purchase_order: "PO",
  approval_assignment: "Persetujuan",
  approval_rule: "Aturan persetujuan",
  user: "Pengguna",
  document: "Dokumen",
  department: "Bagian",
  employee: "Pegawai",
  role: "Peran",
  system_setting: "Pengaturan",
  report: "Laporan",
  support_ticket: "Tiket",
};

function Values({ label, value }: { label: string; value: Prisma.JsonValue | null }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <pre className="max-h-64 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const params = await searchParams;
  const q = sp(params, "q");
  const entity = sp(params, "entitas");
  const { from, to } = dateRangeParams(params);
  const { page, pageSize, skip, take } = pageParams(params, 50);
  const where: Prisma.AuditLogWhereInput = {
    ...(entity ? { entityType: entity } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: zonedMidnight(from) } : {}), ...(to ? { lt: addDays(zonedMidnight(to), 1) } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { action: { contains: q, mode: "insensitive" } },
            { entityId: { contains: q } },
            { actor: { fullName: { contains: q, mode: "insensitive" } } },
            { actor: { username: { contains: q, mode: "insensitive" } } },
            { ipAddress: { contains: q } },
          ],
        }
      : {}),
  };
  const [rows, total, entities] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { actor: { select: { fullName: true, username: true } } } }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ["entityType"], orderBy: { entityType: "asc" } }),
  ]);
  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Catatan permanen setiap tindakan penting: siapa, kapan, dari mana, dan apa yang berubah. Tidak dapat diubah dari aplikasi."
      />
      <ListToolbar
        placeholder="Cari aksi, pelaku, ID, atau IP…"
        dateRange
        filters={[{ key: "entitas", label: "Objek", options: entities.map((e) => ({ value: e.entityType, label: ENTITY_LABEL[e.entityType] ?? e.entityType })) }]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="Tidak ada catatan" />
      ) : (
        <>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {rows.map((a) => {
              const hasDetail = a.oldValues !== null || a.newValues !== null || a.userAgent;
              const head = (
                <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm sm:grid-cols-[11rem_1fr_auto]">
                  <span className="text-xs text-muted-foreground tabular sm:text-sm">{formatDateTime(a.createdAt)}</span>
                  <span className="min-w-0">
                    <code className="font-mono text-[13px] font-medium">{a.action}</code>
                    <span className="text-muted-foreground">
                      {" "}
                      · {ENTITY_LABEL[a.entityType] ?? a.entityType}
                      {a.entityId && <span className="font-mono text-xs"> {a.entityId.slice(0, 8)}</span>}
                    </span>
                    {a.reason && <span className="block truncate text-[13px] text-muted-foreground">“{a.reason}”</span>}
                  </span>
                  <span className="text-[13px] sm:text-right">
                    {a.actor?.fullName ?? "Sistem"}
                    {a.ipAddress && <span className="block text-xs text-muted-foreground">{a.ipAddress}</span>}
                  </span>
                </div>
              );
              return (
                <li key={a.id}>
                  {hasDetail ? (
                    <details className="group">
                      <summary className="cursor-pointer list-none hover:bg-muted/40 [&::-webkit-details-marker]:hidden">{head}</summary>
                      <div className="grid gap-3 border-t bg-muted/20 px-4 py-3 md:grid-cols-2">
                        <Values label="Sebelum" value={a.oldValues} />
                        <Values label="Sesudah" value={a.newValues} />
                        {a.userAgent && <p className="text-xs break-all text-muted-foreground md:col-span-2">{a.userAgent}</p>}
                      </div>
                    </details>
                  ) : (
                    head
                  )}
                </li>
              );
            })}
          </ul>
          <Pager page={page} pageSize={pageSize} total={total} />
        </>
      )}
    </>
  );
}
