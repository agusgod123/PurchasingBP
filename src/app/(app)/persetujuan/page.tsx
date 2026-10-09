import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ClipboardCheck, Clock } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { approvalInbox } from "@/server/queries/approvals";
import { EmptyState, Money, PageHeader, PriorityBadge, StatusBadge } from "@/components/app/ui";
import { ListToolbar, Pager, QuickTabs } from "@/components/app/list-controls";
import { APPROVAL_SUBJECT } from "@/lib/status";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SearchParams } from "@/lib/list-params";
import type { Priority } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Persetujuan" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const params = await searchParams;
  const data = await approvalInbox(user, params);
  const pending = data.tab !== "riwayat";
  return (
    <>
      <PageHeader title="Persetujuan" description="Pengajuan dan perubahan yang membutuhkan keputusan Anda. Yang paling mendesak tampil paling atas." />
      <QuickTabs
        tabs={[
          { value: "menunggu", label: "Menunggu saya", count: data.pendingCount },
          { value: "riwayat", label: "Riwayat keputusan", count: data.decidedCount },
        ]}
      />
      <ListToolbar
        placeholder="Cari nomor atau judul…"
        filters={[{ key: "subject", label: "Jenis", options: Object.entries(APPROVAL_SUBJECT).map(([value, label]) => ({ value, label })) }]}
      />
      {data.rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={pending ? "Tidak ada yang menunggu keputusan Anda" : "Belum ada riwayat keputusan"}
          description={pending ? "Anda akan diberi tahu melalui notifikasi dan email saat ada persetujuan baru." : undefined}
        />
      ) : (
        <>
          <ul className="space-y-2">
            {data.rows.map((r) => (
              <li key={`${r.id}-${r.decidedAt?.toString() ?? ""}`}>
                <Link
                  href={r.href}
                  className={cn(
                    "flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40",
                    r.overdue && "border-red-200 dark:border-red-900",
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">{r.requestNumber}</span>
                      <StatusBadge label={APPROVAL_SUBJECT[r.subjectType]} tone={r.subjectType === "REQUEST" ? "info" : "warning"} />
                      {r.priority && <PriorityBadge priority={r.priority as Priority} />}
                      {r.decision && <StatusBadge label={r.decision === "APPROVE" ? "Anda menyetujui" : "Anda menolak"} tone={r.decision === "APPROVE" ? "success" : "danger"} />}
                    </div>
                    <div className="truncate font-medium">{r.title}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                      <span>
                        {r.requester} · {r.department}
                      </span>
                      <span>Tahap: {r.stepName}</span>
                      {r.dueAt && (
                        <span className={cn("inline-flex items-center gap-1", r.overdue && "font-medium text-red-600")}>
                          <Clock className="size-3.5" /> {r.overdue ? "Lewat tenggat" : "Tenggat"} {formatDateTime(r.dueAt)}
                        </span>
                      )}
                      {r.decidedAt && <span>Diputuskan {formatDateTime(r.decidedAt)}</span>}
                    </div>
                  </div>
                  <div className="hidden text-right sm:block">
                    <div className="text-xs text-muted-foreground">Estimasi</div>
                    <Money value={r.total} className="font-semibold" />
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} />
        </>
      )}
    </>
  );
}
