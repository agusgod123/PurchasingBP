import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ExternalLink, Lock } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { getAssignmentDetail } from "@/server/queries/approvals";
import { EmptyState, KeyValue, Money, PageHeader, PriorityBadge, Section, StatusBadge } from "@/components/app/ui";
import { ApprovalRoute, ChangeList } from "@/components/app/approval-route";
import { DocumentsPanel } from "@/components/app/documents-panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APPROVAL_SUBJECT, ASSIGNMENT_STATUS, DISCREPANCY_TYPE, PRIORITY, RESOLUTION_TYPE } from "@/lib/status";
import { formatCurrency, formatDateOnly, formatDateTime, formatQty } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DecisionPanel } from "./decision-panel";

export const metadata: Metadata = { title: "Keputusan Persetujuan" };

export default async function DecisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const data = await getAssignmentDetail(user, id);
  if (!data) notFound();
  if (data.forbidden) return <EmptyState icon={Lock} title="Tidak dapat dibuka" description="Anda tidak memiliki akses ke persetujuan ini." />;
  const { detail, assignment } = data;
  const r = detail.request;
  const subjectLabel = `${APPROVAL_SUBJECT[data.subjectType]} · tahap ${assignment.stepName}`;
  const priority = r.finalPriority ?? r.requestedPriority;

  return (
    <>
      <PageHeader
        back={{ href: "/persetujuan", label: "Persetujuan" }}
        title={r.title}
        meta={
          <>
            <span className="text-sm font-medium text-muted-foreground">{r.requestNumber}</span>
            <StatusBadge label={APPROVAL_SUBJECT[data.subjectType]} tone={data.subjectType === "REQUEST" ? "info" : "warning"} />
            <PriorityBadge priority={priority} />
            {assignment.dueAt && <span className="text-xs text-muted-foreground">Tenggat {formatDateTime(assignment.dueAt)}</span>}
          </>
        }
        actions={
          <Button variant="outline" asChild>
            <Link href={`/pengajuan/${r.id}`}>
              <ExternalLink className="size-4" /> Detail lengkap
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-2 min-w-0 space-y-6 lg:order-1">
          {data.subjectType === "CHANGE_REQUEST" && data.changeRequest && (
            <Section
              title="Perubahan yang perlu disetujui"
              description={`Diajukan Purchasing${data.changeRequest.poNumber ? ` untuk ${data.changeRequest.poNumber}` : ""}${data.changeRequest.vendor ? ` · ${data.changeRequest.vendor}` : ""}`}
            >
              <p className="text-sm">
                <span className="text-muted-foreground">Alasan:</span> {data.changeRequest.reason}
              </p>
              <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                <ChangeList items={data.changeRequest.items} />
              </div>
              {data.changeRequest.impact !== 0 && (
                <p className="mt-3 flex items-center gap-2 text-sm">
                  <AlertTriangle className="size-4 text-amber-600" />
                  Dampak nilai: <strong>{data.changeRequest.impact > 0 ? "+" : ""}{formatCurrency(data.changeRequest.impact)}</strong>
                </p>
              )}
              {data.quotes.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-sm font-medium">Penawaran vendor</div>
                  <ul className="space-y-1 text-sm">
                    {data.quotes.map((q) => (
                      <li key={q.id} className="flex justify-between gap-2">
                        <span>
                          {q.vendor} {q.quoteNumber && <span className="text-muted-foreground">({q.quoteNumber})</span>}
                          {q.isSelected && <StatusBadge className="ml-2" label="Dipilih" tone="success" />}
                        </span>
                        <Money value={q.totalAmount} />
                      </li>
                    ))}
                  </ul>
                  <DocumentsPanel parentType="quote" parentId={data.quotes[0].id} documents={data.quoteDocs} compact />
                </div>
              )}
            </Section>
          )}

          {data.subjectType === "CANCELLATION" && data.cancellation && (
            <Section title="Usulan pembatalan">
              <KeyValue items={[{ label: "Diusulkan oleh", value: data.cancellation.by }, { label: "Alasan", value: data.cancellation.reason, wide: true }]} />
              <p className="mt-3 text-sm text-muted-foreground">Jika disetujui, sisa pesanan yang belum diterima akan dihentikan dan pengajuan dibatalkan.</p>
            </Section>
          )}

          {data.subjectType === "DISCREPANCY_RESOLUTION" && data.discrepancy && (
            <Section title="Usulan penyelesaian masalah barang" description={data.discrepancy.poNumber}>
              <KeyValue
                items={[
                  { label: "Barang", value: data.discrepancy.itemName },
                  { label: "Masalah", value: `${DISCREPANCY_TYPE[data.discrepancy.type]} · ${formatQty(data.discrepancy.quantity)} ${data.discrepancy.unitName}` },
                  { label: "Keterangan", value: data.discrepancy.description, wide: true },
                  {
                    label: "Usulan",
                    value: data.discrepancy.resolutionType ? `${RESOLUTION_TYPE[data.discrepancy.resolutionType].label} — ${RESOLUTION_TYPE[data.discrepancy.resolutionType].description}` : "—",
                    wide: true,
                  },
                  { label: "Catatan purchasing", value: data.discrepancy.resolutionNote, wide: true },
                ]}
              />
            </Section>
          )}

          {data.diff.length > 0 && (
            <Section title="Perubahan dari versi sebelumnya" description="Pengajuan ini dikirim ulang setelah revisi.">
              <ul className="space-y-1 text-sm">
                {data.diff.map((d, i) => (
                  <li key={i}>
                    <span className="font-medium">{d.itemName}</span>: {d.change}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Barang yang diajukan" description={`Total estimasi ${formatCurrency(r.estimatedTotal)}`}>
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4 sm:pl-5">Barang</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead className="text-right">Estimasi / satuan</TableHead>
                    <TableHead className="pr-4 text-right sm:pr-5">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.items.map((it) => (
                    <TableRow key={it.id} className="align-top hover:bg-transparent">
                      <TableCell className="max-w-[340px] whitespace-normal pl-4 sm:pl-5">
                        <div className="font-medium">{it.itemName}</div>
                        <div className="text-[13px] text-muted-foreground">{it.specification}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {formatQty(it.quantity)} {it.unitName}
                      </TableCell>
                      <TableCell className="text-right">
                        <Money value={it.estimatedUnitPrice} />
                      </TableCell>
                      <TableCell className="pr-4 text-right sm:pr-5">
                        <Money value={it.lineTotal} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section title="Informasi pengajuan">
            <KeyValue
              items={[
                { label: "Pemohon", value: `${r.requester.fullName}${r.requester.position ? ` · ${r.requester.position}` : ""}` },
                { label: "Bagian", value: r.department.name },
                { label: "Tanggal dibutuhkan", value: formatDateOnly(r.neededDate) },
                { label: "Urgensi diusulkan", value: PRIORITY[r.requestedPriority].label },
                { label: "Alasan kebutuhan", value: <span className="whitespace-pre-line">{r.generalReason}</span>, wide: true },
              ]}
            />
            {data.budget && (
              <p className={`mt-4 rounded-lg p-3 text-xs ${data.budget.exceeded ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "bg-muted/50 text-muted-foreground"}`}>
                Sisa anggaran bagian: {formatCurrency(data.budget.remaining)} dari {formatCurrency(data.budget.budget)}.
                {data.budget.exceeded && " Pengajuan ini melampaui sisa anggaran (hanya peringatan)."}
              </p>
            )}
          </Section>

          <Section title="Lampiran">
            <DocumentsPanel parentType="request" parentId={r.id} documents={detail.documents.map((d) => ({ ...d, canDelete: false }))} emptyText="Tidak ada lampiran." />
          </Section>
        </div>

        <aside className="order-1 space-y-6 lg:order-2 lg:sticky lg:top-20 lg:self-start">
          {assignment.canDecide ? (
            <DecisionPanel assignmentId={assignment.id} canSetPriority={data.canSetPriority} defaultPriority={priority} subjectLabel={subjectLabel} />
          ) : (
            <div className="rounded-xl border bg-card p-4 text-sm">
              Status penugasan Anda: <strong>{ASSIGNMENT_STATUS[assignment.status].label}</strong>
            </div>
          )}
          <Section title="Rute persetujuan">
            <ApprovalRoute instance={data.route} />
          </Section>
        </aside>
      </div>
    </>
  );
}
