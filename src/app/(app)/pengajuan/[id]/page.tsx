import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, CircleAlert, Info, Lock } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { getRequestDetail, type RequestDetail } from "@/server/queries/requests";
import { EmptyState, KeyValue, Money, PageHeader, PriorityBadge, Section, StageStepper, StatusBadge } from "@/components/app/ui";
import { ApprovalRoute } from "@/components/app/approval-route";
import { Timeline } from "@/components/app/timeline";
import { DocumentsPanel } from "@/components/app/documents-panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { HANDOVER_STATUS, PO_STATUS, PRIORITY, REQUEST_STATUS } from "@/lib/status";
import { formatDateOnly, formatDateTime, formatQty, formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CancelHandoverButton,
  CommentBox,
  ConfirmHandoverForm,
  PrepareHandoverButton,
  PrioritySelect,
  RequestActionsBar,
} from "./client";

export const metadata: Metadata = { title: "Detail Pengajuan" };

function nextAction(d: RequestDetail): { tone: "info" | "warning" | "danger" | "success" | "violet" | "neutral"; text: string } {
  const r = d.request;
  const pendingNames = d.approvals
    .filter((i) => i.status === "IN_PROGRESS")
    .flatMap((i) => i.steps.filter((s) => s.status === "PENDING").flatMap((s) => s.assignments.filter((a) => a.status === "PENDING").map((a) => `${a.approverName} (${s.name})`)));
  const activePos = d.purchaseOrders.filter((p) => p.status !== "CANCELLED");
  switch (r.status) {
    case "DRAFT":
      return { tone: "neutral", text: d.actions.isRequester ? "Lengkapi isian dan lampiran, lalu kirim pengajuan." : "Masih berupa draf." };
    case "PENDING_APPROVAL":
      return { tone: "warning", text: `Menunggu persetujuan ${pendingNames.join(", ") || "approver"}.` };
    case "REVISION_REQUIRED": {
      const last = d.approvals
        .flatMap((i) => i.steps.flatMap((s) => s.assignments.flatMap((a) => a.decisions)))
        .filter((x) => x.decision === "REJECT")
        .sort((a, b) => +new Date(b.decidedAt) - +new Date(a.decidedAt))[0];
      return { tone: "danger", text: `Perlu revisi${last ? ` — ${last.by}: “${last.comment}”` : ""}. Ubah lalu kirim ulang.` };
    }
    case "ON_HOLD":
      return { tone: "danger", text: `Ditahan: ${r.holdReason ?? "jalur persetujuan belum dapat ditentukan"}. Admin akan memperbaiki konfigurasi.` };
    case "APPROVED":
      return { tone: "info", text: "Disetujui dan berada di antrean Purchasing. Purchasing akan memproses penawaran dan pemesanan." };
    case "IN_PROCUREMENT": {
      if (activePos.some((p) => p.status === "PENDING_CHANGE_APPROVAL"))
        return { tone: "warning", text: "Ada perubahan harga/jumlah/spesifikasi yang menunggu persetujuan pemohon dan atasan." };
      if (activePos.some((p) => p.status === "ON_HOLD"))
        return { tone: "danger", text: "Pesanan ditahan karena ada barang rusak/tidak sesuai. Purchasing sedang menyelesaikannya." };
      const shipping = activePos.find((p) => ["ORDERED", "PARTIALLY_RECEIVED"].includes(p.status));
      if (shipping)
        return {
          tone: "info",
          text: `Dipesan ke ${shipping.vendor ?? "vendor"}${shipping.currentEta ? `, perkiraan tiba ${formatDateOnly(shipping.currentEta)}` : ""}.${shipping.status === "PARTIALLY_RECEIVED" ? " Sebagian barang sudah diterima." : ""}`,
        };
      return { tone: "info", text: "Purchasing sedang memproses pembelian (penawaran & pesanan)." };
    }
    case "READY_FOR_HANDOVER":
      return { tone: "violet", text: "Semua barang sudah diterima dari vendor. Purchasing akan menyiapkan serah terima." };
    case "AWAITING_CONFIRMATION":
      return {
        tone: "violet",
        text: d.actions.isRequester ? "Barang siap diserahkan. Setelah menerima barang, konfirmasi di bagian Serah Terima." : "Menunggu konfirmasi penerimaan dari pemohon.",
      };
    case "COMPLETED":
      return { tone: "success", text: `Selesai pada ${formatDateTime(r.completedAt)}. Barang telah diterima pemohon.` };
    case "CANCELLATION_REQUESTED":
      return { tone: "warning", text: "Pembatalan diusulkan dan menunggu keputusan pihak berwenang." };
    case "CANCELLED":
      return { tone: "neutral", text: `Dibatalkan${r.cancellationReason ? `: ${r.cancellationReason}` : ""}.` };
  }
}

const calloutTone: Record<string, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100",
  warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  danger: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
  violet: "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100",
  neutral: "border-border bg-muted/40",
};

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const detail = await getRequestDetail(user, id);
  if (!detail) notFound();
  if (detail.forbidden) {
    return (
      <EmptyState
        icon={Lock}
        title="Detail pengajuan tidak dapat dibuka"
        description="Anda dapat melihat ringkasan di menu Semua Pengajuan, tetapi detail dan dokumen hanya terbuka bagi pihak terkait."
      />
    );
  }
  const d = detail;
  const r = d.request;
  const st = REQUEST_STATUS[r.status];
  const na = nextAction(d);
  const priority = r.finalPriority ?? r.requestedPriority;
  const latestRequestApproval = d.approvals.find((a) => a.subjectType === "REQUEST");
  const otherApprovals = d.approvals.filter((a) => a !== latestRequestApproval);
  const showProgress = !["DRAFT", "PENDING_APPROVAL", "REVISION_REQUIRED", "ON_HOLD"].includes(r.status);
  const preparedHandover = d.handovers.find((h) => h.status === "PREPARED");

  return (
    <>
      <PageHeader
        back={{ href: d.actions.isRequester ? "/pengajuan" : "/pengajuan/semua", label: d.actions.isRequester ? "Pengajuan Saya" : "Semua Pengajuan" }}
        title={
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span>{r.title}</span>
          </span>
        }
        meta={
          <>
            <span className="text-sm font-medium text-muted-foreground">{r.requestNumber ?? "Draf"}</span>
            <StatusBadge label={st.label} tone={st.tone} />
            <PriorityBadge priority={priority} />
            {r.currentVersionNumber > 1 && <span className="text-xs text-muted-foreground">Versi {r.currentVersionNumber}</span>}
          </>
        }
        actions={<RequestActionsBar id={r.id} actions={d.actions} />}
      />

      <div className="mb-6 rounded-xl border bg-card p-4 sm:p-5">
        <StageStepper current={r.stage} cancelled={r.status === "CANCELLED"} />
        <div className={cn("mt-4 flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm", calloutTone[na.tone])}>
          {na.tone === "danger" ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
          ) : na.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : r.status === "CANCELLED" ? (
            <Ban className="mt-0.5 size-4 shrink-0" />
          ) : (
            <ArrowRight className="mt-0.5 size-4 shrink-0" />
          )}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide opacity-70">Posisi saat ini</div>
            <div>{na.text}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Section title="Barang yang diajukan" description={`${d.items.length} item · total estimasi ${formatCurrency(r.estimatedTotal)}`}>
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4 sm:pl-5">Barang</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead className="text-right">Estimasi / satuan</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    {showProgress && <TableHead className="min-w-40 pr-4 sm:pr-5">Progres</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.items.map((it) => {
                    const req = Number(it.required) || 0;
                    const pct = (n: string) => (req > 0 ? Math.min(100, Math.round((Number(n) / req) * 100)) : 0);
                    return (
                      <TableRow key={it.id} className="align-top hover:bg-transparent">
                        <TableCell className="max-w-[360px] whitespace-normal pl-4 sm:pl-5">
                          <div className="font-medium">{it.itemName}</div>
                          <div className="text-[13px] text-muted-foreground">{it.specification}</div>
                          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            {it.category && <span>{it.category}</span>}
                            {it.neededDate && <span>Dibutuhkan {formatDateOnly(it.neededDate)}</span>}
                            {it.reason && <span>Alasan: {it.reason}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular">
                          {formatQty(it.quantity)} {it.unitName}
                          {Number(it.cancelledQuantity) > 0 && (
                            <div className="text-xs text-amber-700 dark:text-amber-400">−{formatQty(it.cancelledQuantity)} ditutup</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Money value={it.estimatedUnitPrice} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Money value={it.lineTotal} />
                        </TableCell>
                        {showProgress && (
                          <TableCell className="pr-4 sm:pr-5">
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between text-muted-foreground">
                                <span>Diterima</span>
                                <span className="tabular">
                                  {formatQty(it.received)}/{formatQty(it.required)}
                                </span>
                              </div>
                              <Progress value={pct(it.received)} className="h-1.5" />
                              <div className="flex justify-between text-muted-foreground">
                                <span>Diserahkan</span>
                                <span className="tabular">{formatQty(it.handedOver)}</span>
                              </div>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section
            title="Persetujuan"
            description={latestRequestApproval ? undefined : "Rute persetujuan ditentukan otomatis saat pengajuan dikirim."}
            actions={
              d.actions.canSetPriority ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  Prioritas final <PrioritySelect id={r.id} value={r.finalPriority} />
                </div>
              ) : null
            }
          >
            {d.approvals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada proses persetujuan.</p>
            ) : (
              <div className="space-y-6">
                {latestRequestApproval && <ApprovalRoute instance={latestRequestApproval} />}
                {otherApprovals.length > 0 && (
                  <details className="group rounded-lg border px-3 py-2" open={otherApprovals.some((a) => a.status === "IN_PROGRESS" || a.status === "ON_HOLD")}>
                    <summary className="cursor-pointer text-sm font-medium">Proses persetujuan lain ({otherApprovals.length})</summary>
                    <div className="mt-4 space-y-6">
                      {otherApprovals.map((a) => (
                        <ApprovalRoute key={a.id} instance={a} />
                      ))}
                    </div>
                  </details>
                )}
                {r.finalPriority && (
                  <p className="text-xs text-muted-foreground">
                    Prioritas final: {PRIORITY[r.finalPriority].label}
                    {r.finalPrioritySetBy && ` (ditetapkan ${r.finalPrioritySetBy})`}
                  </p>
                )}
              </div>
            )}
          </Section>

          {(d.purchaseOrders.length > 0 || d.handovers.length > 0 || d.actions.canPrepareHandover) && (
            <Section
              id="serah-terima"
              title="Pengadaan & serah terima"
              actions={
                d.actions.canPrepareHandover && d.availableForHandover.length > 0 ? (
                  <PrepareHandoverButton
                    requestId={r.id}
                    items={d.availableForHandover.map((a) => {
                      const it = d.items.find((x) => x.id === a.requestItemId)!;
                      return { ...a, itemName: it.itemName, unitName: it.unitName };
                    })}
                  />
                ) : null
              }
            >
              <div className="space-y-5">
                {preparedHandover && d.actions.isRequester && <ConfirmHandoverForm handover={preparedHandover} />}
                {d.purchaseOrders.map((po) => {
                  const pst = PO_STATUS[po.status];
                  return (
                    <div key={po.id} className="rounded-lg border p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {d.actions.canManageHandover ? (
                            <Link href={`/purchasing/po/${po.id}`} className="font-medium hover:underline">
                              {po.poNumber}
                            </Link>
                          ) : (
                            <span className="font-medium">{po.poNumber}</span>
                          )}
                          <StatusBadge label={pst.label} tone={pst.tone} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {po.vendor ?? "Vendor belum dipilih"} · Purchasing: {po.owner}
                          {po.currentEta && ` · ETA ${formatDateOnly(po.currentEta)}`}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1 text-[13px]">
                        {po.lines.map((l) => (
                          <li key={l.id} className="flex flex-wrap justify-between gap-2">
                            <span>{l.itemName}</span>
                            <span className="tabular text-muted-foreground">
                              dipesan {formatQty(l.quantityOrdered)} · diterima {formatQty(l.received)} {l.unitName}
                              {l.unitPrice && ` · ${formatCurrency(l.unitPrice)}/${l.unitName}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {d.handovers.map((h) => {
                  const hst = HANDOVER_STATUS[h.status];
                  return (
                    <div key={h.id} className="rounded-lg border p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Serah terima {h.handoverNumber}</span>
                          <StatusBadge label={hst.label} tone={hst.tone} />
                        </div>
                        {h.status === "PREPARED" && d.actions.canManageHandover && <CancelHandoverButton handoverId={h.id} />}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Disiapkan {h.preparedBy} · {formatDateTime(h.preparedAt)}
                        {h.location && ` · ${h.location}`}
                        {h.confirmedAt && ` · Dikonfirmasi ${h.confirmedBy} ${formatDateTime(h.confirmedAt)}`}
                      </div>
                      {h.disputeReason && <p className="mt-2 text-sm text-red-700 dark:text-red-300">Selisih: {h.disputeReason}</p>}
                      <ul className="mt-2 space-y-1 text-[13px]">
                        {h.items.map((i) => (
                          <li key={i.id} className="flex justify-between gap-2">
                            <span>{i.itemName}</span>
                            <span className="tabular text-muted-foreground">
                              {formatQty(i.quantity)} {i.unitName}
                              {i.confirmedQuantity !== null && ` · diterima ${formatQty(i.confirmedQuantity)}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3">
                        <DocumentsPanel
                          parentType="handover"
                          parentId={h.id}
                          documents={h.documents}
                          uploadTypes={h.status === "PREPARED" ? ["HANDOVER_PROOF"] : []}
                          compact
                          emptyText="Belum ada bukti serah terima."
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="Dokumen">
            <DocumentsPanel
              parentType="request"
              parentId={r.id}
              documents={d.documents}
              uploadTypes={d.actions.canEdit ? ["REQUEST_ATTACHMENT", "OTHER"] : []}
              emptyText="Belum ada lampiran."
            />
          </Section>

          {d.versions.length > 0 && (
            <Section title="Riwayat versi" description="Setiap pengiriman membentuk versi baru; versi lama tidak pernah ditimpa.">
              <ol className="space-y-3">
                {d.versions.map((v) => (
                  <li key={v.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">Versi {v.versionNumber}</span>
                      <span className="text-xs text-muted-foreground">
                        {v.submittedBy} · {formatDateTime(v.submittedAt)} · <Money value={v.total} />
                      </span>
                    </div>
                    {v.changeSummary && <p className="mt-1 text-[13px] text-muted-foreground">{v.changeSummary}</p>}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-primary">Lihat isi versi</summary>
                      <ul className="mt-2 space-y-1 text-[13px]">
                        {v.items.map((i, idx) => (
                          <li key={idx} className="flex justify-between gap-2">
                            <span>
                              {i.itemName} <span className="text-muted-foreground">— {i.specification}</span>
                            </span>
                            <span className="tabular whitespace-nowrap text-muted-foreground">
                              {formatQty(i.quantity)} {i.unitName} × {formatCurrency(i.price)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </div>

        <aside className="space-y-6">
          <Section title="Ringkasan">
            <KeyValue
              className="sm:grid-cols-1"
              items={[
                { label: "Pemohon", value: `${r.requester.fullName}${r.requester.position ? ` · ${r.requester.position}` : ""}` },
                { label: "Bagian", value: r.department.name },
                { label: "Atasan langsung", value: r.requester.supervisor ?? <span className="text-amber-700">Belum diatur</span> },
                { label: "Tanggal dibutuhkan", value: formatDateOnly(r.neededDate) },
                { label: "Urgensi diusulkan", value: PRIORITY[r.requestedPriority].label },
                { label: "Total estimasi", value: <Money value={r.estimatedTotal} className="font-semibold" /> },
                { label: "Diajukan", value: formatDateTime(r.submittedAt) },
                { label: "Alasan kebutuhan", value: <span className="whitespace-pre-line">{r.generalReason}</span> },
              ]}
            />
            {d.budget && (
              <div className={cn("mt-4 flex gap-2 rounded-lg p-3 text-xs", d.budget.exceeded ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "bg-muted/50 text-muted-foreground")}>
                {d.budget.exceeded ? <AlertTriangle className="size-4 shrink-0" /> : <Info className="size-4 shrink-0" />}
                <span>
                  Anggaran {d.budget.fiscalYear}: sisa {formatCurrency(d.budget.remaining)} dari {formatCurrency(d.budget.budget)}.
                  {d.budget.exceeded && " Pengajuan ini melampaui sisa anggaran."}
                </span>
              </div>
            )}
          </Section>
          <Section title="Riwayat & komentar">
            <div className="space-y-5">
              <CommentBox id={r.id} />
              <Timeline events={d.timeline} />
            </div>
          </Section>
        </aside>
      </div>
    </>
  );
}
