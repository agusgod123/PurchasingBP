import type { Metadata } from "next";
import { Mail } from "lucide-react";
import type { EmailStatus } from "@/generated/prisma/enums";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { EmptyState, KeyValue, PageHeader, Section, StatusBadge } from "@/components/app/ui";
import { ListToolbar, Pager, QuickTabs } from "@/components/app/list-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTime, formatRelative } from "@/lib/format";
import { pageParams, sp, type SearchParams } from "@/lib/list-params";
import type { Tone } from "@/lib/status";
import { RetryEmailButton, TestEmailForm } from "./email-client";

export const metadata: Metadata = { title: "Email Keluar" };

const STATUS: Record<EmailStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Menunggu", tone: "warning" },
  SENT: { label: "Terkirim", tone: "success" },
  FAILED: { label: "Gagal", tone: "danger" },
};

export default async function EmailOutboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const params = await searchParams;
  const status = sp(params, "status") as EmailStatus | undefined;
  const q = sp(params, "q");
  const { page, pageSize, skip, take } = pageParams(params, 30);
  const where = {
    ...(status && status in STATUS ? { status } : {}),
    ...(q ? { OR: [{ toEmail: { contains: q, mode: "insensitive" as const } }, { subject: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, total, counts] = await Promise.all([
    db.emailOutbox.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.emailOutbox.count({ where }),
    db.emailOutbox.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: EmailStatus) => counts.find((c) => c.status === s)?._count ?? 0;
  const config = env();
  const transport = config.EMAIL_TRANSPORT;

  return (
    <>
      <PageHeader title="Email Keluar" description="Semua email dikirim lewat antrean: gagal kirim dicoba ulang otomatis (hingga 8 kali dengan jeda bertambah)." />
      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Section title="Konfigurasi pengiriman" description="Diatur lewat environment variable saat deploy.">
          <KeyValue
            items={[
              {
                label: "Mode",
                value:
                  transport === "smtp" ? (
                    <StatusBadge label="SMTP aktif" tone="success" />
                  ) : transport === "log" ? (
                    <StatusBadge label="Log saja (tidak benar-benar terkirim)" tone="warning" />
                  ) : (
                    <StatusBadge label="Dimatikan" tone="danger" />
                  ),
              },
              { label: "Server SMTP", value: config.SMTP_HOST ? `${config.SMTP_HOST}:${config.SMTP_PORT}` : "—" },
              { label: "Pengirim", value: config.SMTP_FROM },
              { label: "Gagal permanen", value: String(count("FAILED")) },
            ]}
          />
        </Section>
        <Section title="Kirim email uji coba">
          <TestEmailForm defaultTo={user.email} />
        </Section>
      </div>
      <QuickTabs
        param="status"
        tabs={[
          { value: "all", label: "Semua" },
          { value: "PENDING", label: "Menunggu", count: count("PENDING") },
          { value: "FAILED", label: "Gagal", count: count("FAILED") },
          { value: "SENT", label: "Terkirim" },
        ]}
      />
      <ListToolbar placeholder="Cari penerima atau subjek…" />
      {rows.length === 0 ? (
        <EmptyState icon={Mail} title="Tidak ada email" />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Percobaan</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Dibuat</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="max-w-0 min-w-56">
                      <span className="block truncate font-medium">{m.subject}</span>
                      <span className="block truncate text-xs text-muted-foreground">{m.toEmail}</span>
                      {m.lastError && m.status !== "SENT" && <span className="block truncate text-xs text-destructive" title={m.lastError}>{m.lastError}</span>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge {...STATUS[m.status]} />
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {m.attempts}×{m.status === "PENDING" && m.attempts > 0 ? ` · berikutnya ${formatRelative(m.nextAttemptAt)}` : ""}
                      {m.sentAt ? ` · ${formatDateTime(m.sentAt)}` : ""}
                    </TableCell>
                    <TableCell className="hidden text-right text-xs text-muted-foreground sm:table-cell">{formatDateTime(m.createdAt)}</TableCell>
                    <TableCell>{m.status !== "SENT" && <RetryEmailButton id={m.id} />}</TableCell>
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
