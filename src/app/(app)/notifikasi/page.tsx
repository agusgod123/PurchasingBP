import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { EmptyState, PageHeader } from "@/components/app/ui";
import { Pager, QuickTabs } from "@/components/app/list-controls";
import { formatDateTime } from "@/lib/format";
import { NOTIFICATION_TYPES, type NotificationType } from "@/server/notifications/notify";
import { pageParams, sp, type SearchParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";
import { MarkAllRead } from "./mark-all";

export const metadata: Metadata = { title: "Notifikasi" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const params = await searchParams;
  const unreadOnly = sp(params, "tab") === "belum";
  const { page, pageSize, skip, take } = pageParams(params, 30);
  const where = { recipientId: user.id, ...(unreadOnly ? { readAt: null } : {}) };
  const [rows, total, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.notification.count({ where }),
    db.notification.count({ where: { recipientId: user.id, readAt: null } }),
  ]);
  return (
    <>
      <PageHeader title="Notifikasi" description="Pemberitahuan penting juga dikirim lewat email sesuai pengaturan Admin." actions={unread > 0 ? <MarkAllRead /> : null} />
      <QuickTabs
        tabs={[
          { value: "semua", label: "Semua" },
          { value: "belum", label: "Belum dibaca", count: unread },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Bell} title="Tidak ada notifikasi" />
      ) : (
        <>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {rows.map((n) => (
              <li key={n.id}>
                <Link href={n.link ?? "#"} className={cn("flex gap-3 px-4 py-3 hover:bg-muted/50", !n.readAt && "bg-primary/[0.04]")}>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span className="text-sm font-medium">{n.title}</span>
                      <span className="text-xs text-muted-foreground">{NOTIFICATION_TYPES[n.type as NotificationType] ?? n.type}</span>
                    </span>
                    <span className="block text-[13px] text-muted-foreground">{n.body}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Pager page={page} pageSize={pageSize} total={total} />
        </>
      )}
    </>
  );
}
