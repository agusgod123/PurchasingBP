import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { requirePermission } from "@/server/auth/current";
import { PERMISSIONS } from "@/lib/permissions";
import { getPurchaseOrderDetail, vendorOptions } from "@/server/queries/purchasing";
import { KeyValue, Money, PageHeader, Section, StatusBadge } from "@/components/app/ui";
import { DocumentsPanel } from "@/components/app/documents-panel";
import {
  CHANGE_REQUEST_STATUS,
  DISCREPANCY_STATUS,
  DISCREPANCY_TYPE,
  FOLLOWUP_TYPE,
  ITEM_CONDITION,
  PO_STATUS,
  REQUEST_STATUS,
  RESOLUTION_TYPE,
} from "@/lib/status";
import { formatDateOnly, formatDateTime, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FollowupForm, LinesEditor, PoActions, PoNoteBox, QuotesPanel, ResolutionDialog, ShortageDialog } from "./po-client";

export const metadata: Metadata = { title: "Detail PO" };

const PO_STEPS = [
  { key: "DRAFT", label: "Draf" },
  { key: "READY_TO_ORDER", label: "Siap dipesan" },
  { key: "ORDERED", label: "Dipesan" },
  { key: "RECEIVED", label: "Diterima" },
  { key: "CLOSED", label: "Ditutup" },
] as const;

function stepIndex(status: string) {
  switch (status) {
    case "DRAFT":
    case "PENDING_CHANGE_APPROVAL":
      return 0;
    case "READY_TO_ORDER":
      return 1;
    case "ORDERED":
    case "PARTIALLY_RECEIVED":
    case "ON_HOLD":
      return 2;
    case "RECEIVED":
      return 3;
    case "CLOSED":
      return 4;
    default:
      return -1;
  }
}

export default async function PoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.PURCHASING_MANAGE);
  const [data, vendors] = await Promise.all([getPurchaseOrderDetail(user, id), vendorOptions()]);
  if (!data) notFound();
  const { po } = data;
  const st = PO_STATUS[po.status];
  const idx = stepIndex(po.status);

  return (
    <>
      <PageHeader
        back={{ href: "/purchasing/po", label: "Pesanan (PO)" }}
        title={po.title ? `${po.poNumber} · ${po.title}` : po.poNumber}
        meta={
          <>
            <StatusBadge label={st.label} tone={st.tone} />
            {po.overdue && <StatusBadge label="Terlambat" tone="danger" />}
            {po.needsReviewAt && <StatusBadge label="Perlu ditinjau" tone="warning" />}
            <span className="text-sm text-muted-foreground">
              {po.vendor?.name ?? "Vendor belum dipilih"} · <Money value={po.totalAmount} /> · Petugas {po.owner.fullName}
            </span>
          </>
        }
        actions={<PoActions data={data} />}
      />

      {po.status !== "CANCELLED" && (
        <div className="mb-6 rounded-xl border bg-card p-4">
          <ol className="grid grid-cols-5 gap-1.5">
            {PO_STEPS.map((s, i) => (
              <li key={s.key}>
                <div className={cn("h-1.5 rounded-full bg-muted", i < idx && "bg-primary", i === idx && "bg-primary/60")} />
                <div className={cn("mt-2 truncate text-xs font-medium text-muted-foreground", i <= idx && "text-foreground")}>{s.label}</div>
              </li>
            ))}
          </ol>
          {(po.holdReason || po.status === "PENDING_CHANGE_APPROVAL") && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {po.holdReason ?? "Menunggu persetujuan perubahan dari pemohon dan atasannya. PO otomatis siap dipesan setelah semua perubahan disetujui."}
            </p>
          )}
        </div>
      )}
      {po.status === "CANCELLED" && (
        <p className="mb-6 rounded-xl border bg-muted/40 p-4 text-sm">
          Dibatalkan {po.cancelledBy} pada {formatDateTime(po.cancelledAt)}: {po.cancellationReason}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Section title="Baris pesanan" description="Setiap baris terhubung ke item pengajuan asal.">
            <LinesEditor data={data} vendors={vendors} />
          </Section>

          <Section title="Penawaran vendor" description="Simpan semua penawaran yang dipertimbangkan, lalu pilih yang digunakan.">
            <QuotesPanel data={data} vendors={vendors} />
          </Section>

          {(data.receipts.length > 0 || data.flags.canReceive || data.discrepancies.length > 0) && (
            <Section id="penerimaan" title="Penerimaan & masalah barang" actions={data.flags.canReceive ? <ShortageDialog data={data} /> : null}>
              <div className="space-y-4">
                {data.discrepancies.map((d) => {
                  const ds = DISCREPANCY_STATUS[d.status];
                  return (
                    <div key={d.id} className={cn("rounded-lg border p-3", d.status === "OPEN" && "border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-950/20")}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">{DISCREPANCY_TYPE[d.type]}</span>
                          <span>
                            · {d.itemName} {formatQty(d.quantity)} {d.unitName}
                          </span>
                          <StatusBadge label={ds.label} tone={ds.tone} />
                        </div>
                        {d.status === "OPEN" && <ResolutionDialog discrepancyId={d.id} type={d.type} />}
                      </div>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        {d.description} · dilaporkan {d.reportedBy}, {formatDateTime(d.reportedAt)}
                      </p>
                      {d.resolutionType && (
                        <p className="mt-1 text-[13px]">
                          Penyelesaian: <strong>{RESOLUTION_TYPE[d.resolutionType].label}</strong> — {d.resolutionNote}
                          {d.replacementPo && (
                            <>
                              {" "}
                              ·{" "}
                              <Link href={`/purchasing/po/${d.replacementPo.id}`} className="text-primary hover:underline">
                                {d.replacementPo.poNumber}
                              </Link>
                            </>
                          )}
                        </p>
                      )}
                      <div className="mt-2">
                        <DocumentsPanel
                          parentType="discrepancy"
                          parentId={d.id}
                          documents={d.documents}
                          uploadTypes={d.status !== "RESOLVED" ? ["DISCREPANCY_EVIDENCE"] : []}
                          compact
                          emptyText="Belum ada bukti."
                        />
                      </div>
                    </div>
                  );
                })}
                {data.receipts.length === 0 && <p className="text-sm text-muted-foreground">Belum ada barang yang diterima.</p>}
                {data.receipts.map((r) => (
                  <div key={r.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{r.receiptNumber}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(r.receivedAt)} · {r.receivedBy}
                        {r.deliveryNoteNumber && ` · SJ ${r.deliveryNoteNumber}`}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 text-[13px]">
                      {r.items.map((i) => (
                        <li key={i.id} className="flex flex-wrap justify-between gap-2">
                          <span>{i.itemName}</span>
                          <span className="tabular text-muted-foreground">
                            datang {formatQty(i.received)} · baik {formatQty(i.accepted)}
                            {Number(i.rejected) > 0 && (
                              <span className="text-red-600">
                                {" "}
                                · ditolak {formatQty(i.rejected)} ({ITEM_CONDITION[i.condition]})
                              </span>
                            )}{" "}
                            {i.unitName}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2">
                      <DocumentsPanel
                        parentType="receipt"
                        parentId={r.id}
                        documents={r.documents}
                        uploadTypes={["DELIVERY_NOTE", "RECEIPT_EVIDENCE"]}
                        compact
                        emptyText="Belum ada surat jalan / foto."
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section id="tindak-lanjut" title="Tindak lanjut vendor" actions={<FollowupForm data={data} />}>
            {data.followups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada tindak lanjut.</p>
            ) : (
              <ol className="space-y-3">
                {data.followups.map((f) => (
                  <li key={f.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <StatusBadge label={FOLLOWUP_TYPE[f.type]} tone={f.type === "DELAY" ? "warning" : f.type === "ESCALATION" ? "danger" : "neutral"} />
                      <span className="text-xs text-muted-foreground">
                        {formatDateOnly(f.actionDate)} · PJ {f.responsible}
                      </span>
                    </div>
                    {f.reason && <p className="mt-1">Alasan: {f.reason}</p>}
                    <p className="mt-1">Tindakan: {f.actionTaken}</p>
                    {f.vendorResponse && <p className="mt-1 text-muted-foreground">Respons vendor: {f.vendorResponse}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {f.newEta && `ETA ${formatDateOnly(f.previousEta)} → ${formatDateOnly(f.newEta)}`}
                      {f.targetResolutionDate && ` · target selesai ${formatDateOnly(f.targetResolutionDate)}`}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title="Dokumen PO" description="Bukti pemesanan wajib sebelum PO ditandai dipesan.">
            <DocumentsPanel
              parentType="po"
              parentId={po.id}
              documents={data.documents}
              uploadTypes={["CLOSED", "CANCELLED"].includes(po.status) ? [] : ["ORDER_PROOF", "OTHER"]}
              emptyText="Belum ada dokumen."
            />
          </Section>
        </div>

        <aside className="space-y-6">
          {(po.status === "DRAFT" || po.status === "READY_TO_ORDER") && data.orderChecks.length > 0 && (
            <Section title="Kelengkapan sebelum dipesan">
              <ul className="space-y-2 text-sm">
                {data.orderChecks.map((c) => (
                  <li key={c.message} className="flex items-start gap-2">
                    {c.satisfied ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" /> : <CircleDashed className="mt-0.5 size-4 text-muted-foreground" />}
                    <span>
                      {c.message}
                      {c.description && <span className="block text-xs text-muted-foreground">{c.description}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="Informasi">
            <KeyValue
              className="sm:grid-cols-1"
              items={[
                { label: "Vendor", value: po.vendor ? `${po.vendor.name}${po.vendor.contactPerson ? ` · ${po.vendor.contactPerson}` : ""}${po.vendor.phone ? ` · ${po.vendor.phone}` : ""}` : "—" },
                { label: "Referensi vendor", value: po.vendorReference },
                { label: "Tanggal pesan", value: formatDateTime(po.orderedAt) },
                {
                  label: "Perkiraan tiba",
                  value: (
                    <span className={cn(po.overdue && "font-medium text-red-600")}>
                      {formatDateOnly(po.currentEta)}
                      {po.expectedDeliveryDate && po.currentEta && +po.currentEta !== +po.expectedDeliveryDate && (
                        <span className="text-xs text-muted-foreground"> (awal {formatDateOnly(po.expectedDeliveryDate)})</span>
                      )}
                    </span>
                  ),
                },
                ...(po.replaces ? [{ label: "Pengganti untuk", value: <Link className="text-primary hover:underline" href={`/purchasing/po/${po.replaces.id}`}>{po.replaces.poNumber}</Link> }] : []),
                ...(po.replacements.length
                  ? [
                      {
                        label: "PO pengganti",
                        value: (
                          <span className="flex flex-wrap gap-2">
                            {po.replacements.map((r) => (
                              <Link key={r.id} className="text-primary hover:underline" href={`/purchasing/po/${r.id}`}>
                                {r.poNumber}
                              </Link>
                            ))}
                          </span>
                        ),
                      },
                    ]
                  : []),
                { label: "Catatan", value: po.notes },
              ]}
            />
          </Section>
          <Section title={`Pengajuan terkait (${data.requests.length})`}>
            <ul className="space-y-2">
              {data.requests.map((r) => (
                <li key={r.id} className="text-sm">
                  <Link href={`/pengajuan/${r.id}`} className="font-medium hover:underline">
                    {r.requestNumber}
                  </Link>{" "}
                  <StatusBadge label={REQUEST_STATUS[r.status].label} tone={REQUEST_STATUS[r.status].tone} />
                  <div className="truncate text-xs text-muted-foreground">
                    {r.title} · {r.requester.fullName} · {r.department.name} · butuh {formatDateOnly(r.neededDate)}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
          {data.changeRequests.length > 0 && (
            <Section title="Permintaan perubahan">
              <ul className="space-y-2 text-sm">
                {data.changeRequests.map((c) => (
                  <li key={c.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/pengajuan/${c.requestId}`} className="font-medium hover:underline">
                        {c.requestNumber}
                      </Link>
                      <StatusBadge label={CHANGE_REQUEST_STATUS[c.status].label} tone={CHANGE_REQUEST_STATUS[c.status].tone} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.reason} · {formatDateTime(c.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="Catatan & riwayat status">
            <div className="space-y-4">
              <PoNoteBox poId={po.id} />
              <ol className="space-y-3 text-sm">
                {[
                  ...data.comments.map((c) => ({ id: c.id, at: c.createdAt, title: "Catatan", body: c.body, by: c.author })),
                  ...data.statusHistory.map((h) => ({ id: h.id, at: h.at, title: PO_STATUS[h.to].label, body: h.reason, by: h.by })),
                ]
                  .sort((a, b) => +new Date(b.at) - +new Date(a.at))
                  .map((e) => (
                    <li key={e.id}>
                      <div className="font-medium">{e.title}</div>
                      {e.body && <p className="whitespace-pre-line text-[13px] text-muted-foreground">{e.body}</p>}
                      <div className="text-xs text-muted-foreground">
                        {e.by} · {formatDateTime(e.at)}
                      </div>
                    </li>
                  ))}
              </ol>
            </div>
          </Section>
        </aside>
      </div>
    </>
  );
}
