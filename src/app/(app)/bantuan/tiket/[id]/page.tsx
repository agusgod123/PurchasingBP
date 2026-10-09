import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/current";
import { can } from "@/server/auth/user";
import { db } from "@/server/db";
import { KeyValue, PageHeader, PriorityBadge, Section, StatusBadge } from "@/components/app/ui";
import { PERMISSIONS } from "@/lib/permissions";
import { PRIORITY, TICKET_CATEGORY, TICKET_STATUS } from "@/lib/status";
import { formatDateTime } from "@/lib/format";
import { TicketConversation, TicketManagePanel } from "./ticket-client";

export const metadata: Metadata = { title: "Detail Tiket" };

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const manager = can(user, PERMISSIONS.SUPPORT_MANAGE);
  const t = await db.supportTicket
    .findUnique({
      where: { id },
      include: {
        reporter: { select: { fullName: true, email: true, employee: { select: { department: { select: { name: true } } } } } },
        assignee: { select: { fullName: true } },
        relatedRequest: { select: { id: true, requestNumber: true } },
        comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, fullName: true } } } },
      },
    })
    .catch(() => null);
  if (!t || (!manager && t.reporterId !== user.id)) notFound();

  const supportUsers = manager
    ? await db.user.findMany({
        where: { accountStatus: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { code: PERMISSIONS.SUPPORT_MANAGE } } } } } } },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      })
    : [];

  const comments = t.comments
    .filter((c) => manager || !c.isInternal)
    .map((c) => ({ id: c.id, body: c.body, isInternal: c.isInternal, createdAt: c.createdAt.toISOString(), authorName: c.author.fullName, mine: c.author.id === user.id, fromReporter: c.author.id === t.reporterId }));

  const closed = t.status === "CLOSED";

  return (
    <>
      <PageHeader
        back={{ href: "/bantuan/tiket", label: "Tiket Bantuan" }}
        title={t.subject}
        meta={
          <>
            <span className="text-sm text-muted-foreground">{t.ticketNumber}</span>
            <StatusBadge {...TICKET_STATUS[t.status]} />
            <PriorityBadge priority={t.priority ?? t.urgency} />
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <Section title="Percakapan">
            <TicketConversation
              ticketId={t.id}
              manager={manager}
              closed={closed}
              opening={{ body: t.description, authorName: t.reporter.fullName, createdAt: t.createdAt.toISOString() }}
              comments={comments}
            />
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Informasi">
            <KeyValue
              className="sm:grid-cols-1"
              items={[
                { label: "Pelapor", value: `${t.reporter.fullName}${t.reporter.employee ? ` · ${t.reporter.employee.department.name}` : ""}` },
                { label: "Kategori", value: TICKET_CATEGORY[t.category] },
                { label: "Urgensi dari pelapor", value: PRIORITY[t.urgency].label },
                { label: "Penanggung jawab", value: t.assignee?.fullName ?? "Belum ditetapkan" },
                ...(t.forwardedTo ? [{ label: "Diteruskan ke", value: t.forwardedTo }] : []),
                ...(t.relatedRequest
                  ? [
                      {
                        label: "Pengajuan terkait",
                        value: (
                          <Link className="text-primary hover:underline" href={`/pengajuan/${t.relatedRequest.id}`}>
                            {t.relatedRequest.requestNumber}
                          </Link>
                        ),
                      },
                    ]
                  : []),
                { label: "Dibuat", value: formatDateTime(t.createdAt) },
                ...(t.resolvedAt ? [{ label: "Diselesaikan", value: formatDateTime(t.resolvedAt) }] : []),
              ]}
            />
          </Section>
          {manager && (
            <Section title="Tindak lanjut" description="Perubahan status diberitahukan ke pelapor.">
              <TicketManagePanel
                ticketId={t.id}
                users={supportUsers}
                initial={{ status: t.status, priority: t.priority, assigneeId: t.assigneeId, forwardedTo: t.forwardedTo }}
              />
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
