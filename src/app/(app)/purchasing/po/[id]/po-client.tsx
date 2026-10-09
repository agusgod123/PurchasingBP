"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, PackageOpen, Plus, Save, Send, Trash2, Truck, Undo2, XCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { MoneyInput, QtyInput } from "@/components/app/inputs";
import { DocumentsPanel } from "@/components/app/documents-panel";
import { Money, StatusBadge } from "@/components/app/ui";
import { useAction } from "@/components/app/use-action";
import { formatCurrency, formatDateOnly, formatQty, toDateInputValue } from "@/lib/format";
import { FOLLOWUP_TYPE, RESOLUTION_TYPE } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { PoDetail } from "@/server/queries/purchasing";
import type { FollowupType, ItemCondition, ResolutionType } from "@/generated/prisma/enums";
import {
  addFollowupAction,
  addPoCommentAction,
  addQuoteAction,
  cancelPoAction,
  closePoAction,
  deleteQuoteAction,
  markOrderedAction,
  markReadyAction,
  proposeResolutionAction,
  recordReceiptAction,
  reportShortageAction,
  revertToDraftAction,
  selectQuoteAction,
  updatePoAction,
} from "../../actions";

type Vendors = Array<{ id: string; name: string }>;
const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Tindakan utama di header
// ---------------------------------------------------------------------------

export function PoActions({ data }: { data: PoDetail }) {
  const { po, flags } = data;
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const ready = useAction(markReadyAction, {
    success: (d) =>
      d.status === "READY_TO_ORDER"
        ? "PO siap dipesan."
        : `Perubahan dikirim untuk persetujuan (${d.changeRequests} pengajuan).${d.holds?.length ? " Sebagian ditahan: " + d.holds.join(" ") : ""}`,
  });
  const revert = useAction(revertToDraftAction);
  const cancel = useAction(cancelPoAction);
  const close = useAction(closePoAction);

  const doReady = async (r?: string) => {
    const res = await ready.run(po.id, r);
    if (!res.ok && res.fieldErrors?.reason) setReasonOpen(true);
    if (res.ok) setReasonOpen(false);
  };

  return (
    <>
      {flags.canMarkReady && (
        <Button onClick={() => (flags.hasUnapprovedChanges ? setReasonOpen(true) : void doReady())} disabled={ready.pending}>
          {ready.pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Tandai siap dipesan
        </Button>
      )}
      {flags.canOrder && <OrderDialog data={data} />}
      {flags.canReceive && <ReceiptDialog data={data} />}
      {flags.canClose && (
        <Button onClick={() => void close.run(po.id)} disabled={close.pending}>
          <Lock className="size-4" /> Tutup PO
        </Button>
      )}
      {flags.canRevert && (
        <Button variant="outline" onClick={() => void revert.run(po.id)} disabled={revert.pending}>
          <Undo2 className="size-4" /> Kembalikan ke draf
        </Button>
      )}
      {flags.canCancel && (
        <ReasonDialog
          trigger={
            <Button variant="ghost" className="text-destructive hover:text-destructive">
              <XCircle className="size-4" /> Batalkan PO
            </Button>
          }
          title="Batalkan PO?"
          description={flags.shipping ? "PO sudah dipesan ke vendor. Pastikan vendor telah dihubungi. Item kembali ke antrean." : "Item kembali ke antrean purchasing."}
          confirmText="Batalkan PO"
          destructive
          onConfirm={(r) => cancel.run(po.id, r)}
        />
      )}
      <Dialog open={reasonOpen} onOpenChange={setReasonOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajukan persetujuan perubahan</DialogTitle>
            <DialogDescription>
              Harga aktual, jumlah, atau spesifikasi berbeda dari pengajuan yang disetujui. Pemohon dan atasannya akan diminta menyetujui sebelum barang dipesan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cr-reason">Alasan perubahan *</Label>
            <Textarea id="cr-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: harga distributor naik 5%" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void doReady(reason)} disabled={!reason.trim() || ready.pending}>
              {ready.pending && <Loader2 className="size-4 animate-spin" />} Kirim untuk persetujuan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function OrderDialog({ data }: { data: PoDetail }) {
  const [open, setOpen] = useState(false);
  const [eta, setEta] = useState(toDateInputValue(data.po.expectedDeliveryDate) || "");
  const [ref, setRef] = useState(data.po.vendorReference ?? "");
  const [orderedAt, setOrderedAt] = useState(today());
  const order = useAction(markOrderedAction, { onSuccess: () => setOpen(false) });
  const unmet = data.orderChecks.filter((c) => !c.satisfied);
  const quoteMissing = data.quotes.length > 0 && !data.quotes.some((q) => q.isSelected);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Send className="size-4" /> Tandai dipesan
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tandai sudah dipesan ke vendor</DialogTitle>
          <DialogDescription>Pemohon akan diberi tahu perkiraan tanggal kedatangan.</DialogDescription>
        </DialogHeader>
        {(unmet.length > 0 || quoteMissing) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4" /> Belum lengkap
            </div>
            <ul className="mt-1 list-disc pl-5">
              {unmet.map((c) => (
                <li key={c.message}>{c.message}</li>
              ))}
              {quoteMissing && <li>Pilih penawaran yang digunakan</li>}
            </ul>
          </div>
        )}
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ordered-at">Tanggal pesan</Label>
              <Input id="ordered-at" type="date" value={orderedAt} onChange={(e) => setOrderedAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eta">Perkiraan tiba *</Label>
              <Input id="eta" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vref">No. pesanan/referensi vendor</Label>
            <Input id="vref" value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            disabled={!eta || order.pending || unmet.length > 0 || quoteMissing}
            onClick={() => void order.run(data.po.id, { expectedDeliveryDate: eta, vendorReference: ref, orderedAt })}
          >
            {order.pending && <Loader2 className="size-4 animate-spin" />} Konfirmasi dipesan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Editor baris PO
// ---------------------------------------------------------------------------

export function LinesEditor({ data, vendors }: { data: PoDetail; vendors: Vendors }) {
  const { po, flags } = data;
  const [vendorId, setVendorId] = useState(po.vendorId ?? "");
  const [title, setTitle] = useState(po.title ?? "");
  const [notes, setNotes] = useState(po.notes ?? "");
  const [lines, setLines] = useState(
    data.lines.map((l) => ({ id: l.id, requestItemId: l.requestItemId, quantity: l.quantityOrdered, unitPrice: String(Math.round(Number(l.unitPrice))), specification: l.specification })),
  );
  const [dirty, setDirty] = useState(false);
  const save = useAction(updatePoAction, { onSuccess: () => setDirty(false) });
  const editable = flags.editable;

  const patch = (id: string, p: Partial<(typeof lines)[number]>) => {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));
    setDirty(true);
  };
  const total = lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);

  return (
    <div className="space-y-4">
      {editable && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Vendor</Label>
            <Select
              value={vendorId}
              onValueChange={(v) => {
                setVendorId(v);
                setDirty(true);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-title">Judul</Label>
            <Input
              id="po-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
            />
          </div>
        </div>
      )}
      <div className="space-y-2">
        {data.lines.map((l) => {
          const edit = lines.find((x) => x.id === l.id)!;
          const priceDiff = Number(edit.unitPrice) - Number(l.estimatedUnitPrice);
          const needsApproval = (l.priceChanged && !l.priceApproved) || l.specChanged || Number(edit.quantity) > Number(l.requiredQty);
          return (
            <div key={l.id} className={cn("rounded-lg border p-3", needsApproval && po.status === "DRAFT" && "border-amber-300 dark:border-amber-800")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {l.lineNo}. {l.itemName}
                  </div>
                  <a href={`/pengajuan/${l.request.id}`} className="text-xs text-primary hover:underline">
                    {l.request.requestNumber} · {l.request.requester.fullName}
                  </a>
                </div>
                <div className="flex flex-wrap gap-1">
                  {l.priceChanged && (
                    <StatusBadge label={l.priceApproved ? "Harga disetujui" : "Harga berubah"} tone={l.priceApproved ? "success" : "warning"} />
                  )}
                  {l.specChanged && <StatusBadge label="Spesifikasi berubah" tone="warning" />}
                  {Number(l.closedQuantity) > 0 && <StatusBadge label={`${formatQty(l.closedQuantity)} ditutup`} tone="neutral" />}
                </div>
              </div>
              {editable ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_100px_160px_auto] sm:items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Spesifikasi</Label>
                    <Input value={edit.specification} onChange={(e) => patch(l.id, { specification: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Jumlah ({l.unitName})</Label>
                    <QtyInput value={edit.quantity} onValueChange={(v) => patch(l.id, { quantity: v })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Harga satuan aktual</Label>
                    <MoneyInput value={edit.unitPrice} onValueChange={(v) => patch(l.id, { unitPrice: v })} />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Hapus baris"
                    disabled={lines.length <= 1}
                    onClick={() => {
                      setLines((ls) => ls.filter((x) => x.id !== l.id));
                      setDirty(true);
                    }}
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                  <p className="text-xs text-muted-foreground sm:col-span-4">
                    Estimasi pengajuan {formatCurrency(l.estimatedUnitPrice)}
                    {priceDiff !== 0 && (
                      <span className={priceDiff > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700"}>
                        {" "}
                        ({priceDiff > 0 ? "+" : ""}
                        {formatCurrency(priceDiff)})
                      </span>
                    )}{" "}
                    · kebutuhan {formatQty(l.requiredQty)} {l.unitName}
                  </p>
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
                  <div>
                    <div className="text-muted-foreground">Dipesan</div>
                    <div className="tabular font-medium">
                      {formatQty(l.quantityOrdered)} {l.unitName}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Diterima baik</div>
                    <div className="tabular font-medium">{formatQty(l.accepted)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Sisa ditunggu</div>
                    <div className={cn("tabular font-medium", Number(l.outstanding) > 0 && "text-amber-700 dark:text-amber-400")}>{formatQty(l.outstanding)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Harga / subtotal</div>
                    <div className="tabular font-medium">
                      {formatCurrency(l.unitPrice)} / {formatCurrency(l.lineTotal)}
                    </div>
                  </div>
                  <div className="col-span-2 text-muted-foreground sm:col-span-4">{l.specification}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {editable && (
        <div className="space-y-1.5">
          <Label htmlFor="po-notes">Catatan PO</Label>
          <Textarea
            id="po-notes"
            rows={2}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setDirty(true);
            }}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <div className="text-sm">
          Total PO <span className="ml-2 tabular text-base font-semibold">{formatCurrency(editable ? total : po.totalAmount)}</span>
        </div>
        {editable && (
          <Button
            variant={dirty ? "default" : "outline"}
            disabled={!dirty || save.pending}
            onClick={() =>
              void save.run(po.id, {
                lockVersion: po.lockVersion,
                vendorId: vendorId || null,
                title,
                notes,
                lines: lines.map((l) => ({ id: l.id, requestItemId: l.requestItemId, quantity: l.quantity, unitPrice: l.unitPrice || "0", specification: l.specification })),
              })
            }
          >
            {save.pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Simpan perubahan
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Penawaran vendor
// ---------------------------------------------------------------------------

export function QuotesPanel({ data, vendors }: { data: PoDetail; vendors: Vendors }) {
  const canEdit = ["DRAFT", "READY_TO_ORDER", "PENDING_CHANGE_APPROVAL"].includes(data.po.status);
  const canSelect = ["DRAFT", "READY_TO_ORDER"].includes(data.po.status);
  const select = useAction(selectQuoteAction);
  const remove = useAction(deleteQuoteAction);
  return (
    <div className="space-y-3">
      {data.quotes.length === 0 && <p className="text-sm text-muted-foreground">Belum ada penawaran. Simpan penawaran yang dipertimbangkan, termasuk pembanding.</p>}
      {data.quotes.map((q) => (
        <div key={q.id} className={cn("rounded-lg border p-3", q.isSelected && "border-emerald-300 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{q.vendor}</span>
              {q.quoteNumber && <span className="text-xs text-muted-foreground">{q.quoteNumber}</span>}
              {q.isSelected && <StatusBadge label="Dipilih" tone="success" />}
            </div>
            <div className="flex items-center gap-2">
              <Money value={q.totalAmount} className="font-semibold" />
              {canSelect && !q.isSelected && (
                <ReasonDialog
                  trigger={
                    <Button size="sm" variant="outline">
                      Pilih
                    </Button>
                  }
                  title={`Pilih penawaran ${q.vendor}?`}
                  description="Vendor PO akan disesuaikan dengan penawaran ini."
                  label="Alasan pemilihan"
                  required={false}
                  confirmText="Pilih penawaran"
                  onConfirm={(note) => select.run(q.id, note)}
                />
              )}
              {canSelect && (
                <Button size="icon" variant="ghost" aria-label="Hapus penawaran" onClick={() => void remove.run(q.id)}>
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Tanggal {formatDateOnly(q.quoteDate)}
            {q.validUntil && ` · berlaku s.d. ${formatDateOnly(q.validUntil)}`} · dicatat {q.createdBy}
            {q.selectionNote && ` · alasan: ${q.selectionNote}`}
          </div>
          {q.notes && <p className="mt-1 text-[13px]">{q.notes}</p>}
          <div className="mt-2">
            <DocumentsPanel parentType="quote" parentId={q.id} documents={q.documents} uploadTypes={canEdit ? ["VENDOR_QUOTE"] : []} compact emptyText="Belum ada berkas penawaran." />
          </div>
        </div>
      ))}
      {canEdit && <AddQuoteDialog poId={data.po.id} vendors={vendors} defaultVendor={data.po.vendorId} />}
    </div>
  );
}

function AddQuoteDialog({ poId, vendors, defaultVendor }: { poId: string; vendors: Vendors; defaultVendor: string | null }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ vendorId: defaultVendor ?? "", quoteNumber: "", quoteDate: today(), validUntil: "", totalAmount: "", notes: "" });
  const add = useAction(addQuoteAction, {
    onSuccess: () => {
      setOpen(false);
      setF({ vendorId: defaultVendor ?? "", quoteNumber: "", quoteDate: today(), validUntil: "", totalAmount: "", notes: "" });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4" /> Tambah penawaran
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah penawaran vendor</DialogTitle>
          <DialogDescription>Setelah disimpan, unggah berkas penawaran pada kartu penawaran.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Vendor *</Label>
            <Select value={f.vendorId} onValueChange={(v) => setF({ ...f, vendorId: v })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>No. penawaran</Label>
              <Input value={f.quoteNumber} onChange={(e) => setF({ ...f, quoteNumber: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Nilai total *</Label>
              <MoneyInput value={f.totalAmount} onValueChange={(v) => setF({ ...f, totalAmount: v })} />
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal *</Label>
              <Input type="date" value={f.quoteDate} onChange={(e) => setF({ ...f, quoteDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Berlaku sampai</Label>
              <Input type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            disabled={!f.vendorId || !f.totalAmount || add.pending}
            onClick={() => void add.run(poId, { ...f, validUntil: f.validUntil || null, quoteNumber: f.quoteNumber || null, notes: f.notes || null })}
          >
            {add.pending && <Loader2 className="size-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Penerimaan barang
// ---------------------------------------------------------------------------

function ReceiptDialog({ data }: { data: PoDetail }) {
  const [open, setOpen] = useState(false);
  const open_ = data.lines.filter((l) => Number(l.outstanding) > 0);
  const [rows, setRows] = useState(
    Object.fromEntries(open_.map((l) => [l.id, { received: "", rejected: "", condition: "GOOD" as ItemCondition, notes: "" }])),
  );
  const [meta, setMeta] = useState({ deliveryNoteNumber: "", receivedAt: today(), notes: "" });
  const key = useRef(crypto.randomUUID());
  const receipt = useAction(recordReceiptAction, {
    success: (d) => `${d.receiptNumber} tercatat. ${d.poStatus === "ON_HOLD" ? "PO ditahan karena ada barang bermasalah." : d.poStatus === "RECEIVED" ? "Semua barang diterima." : "Penerimaan sebagian."}`,
    onSuccess: () => {
      setOpen(false);
      key.current = crypto.randomUUID();
    },
  });
  const set = (id: string, p: Partial<(typeof rows)[string]>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...p } }));
  const hasAny = Object.values(rows).some((r) => Number(r.received) > 0);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PackageOpen className="size-4" /> Catat penerimaan
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Catat penerimaan dari vendor</DialogTitle>
          <DialogDescription>Isi jumlah yang datang. Barang rusak/tidak sesuai dicatat terpisah dan menahan seluruh pesanan sampai diselesaikan.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>No. surat jalan</Label>
            <Input value={meta.deliveryNoteNumber} onChange={(e) => setMeta({ ...meta, deliveryNoteNumber: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Tanggal terima</Label>
            <Input type="date" value={meta.receivedAt} onChange={(e) => setMeta({ ...meta, receivedAt: e.target.value })} />
          </div>
        </div>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {open_.map((l) => {
            const r = rows[l.id];
            const bad = r.condition !== "GOOD";
            return (
              <div key={l.id} className="rounded-lg border p-3">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="font-medium">{l.itemName}</span>
                  <span className="text-muted-foreground">
                    sisa {formatQty(l.outstanding)} {l.unitName}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[100px_160px_100px_1fr]">
                  <div className="space-y-1">
                    <Label className="text-xs">Datang</Label>
                    <QtyInput value={r.received} onValueChange={(v) => set(l.id, { received: v })} placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Kondisi</Label>
                    <Select value={r.condition} onValueChange={(v) => set(l.id, { condition: v as ItemCondition, rejected: v === "GOOD" ? "" : r.rejected })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GOOD">Semua baik</SelectItem>
                        <SelectItem value="DAMAGED">Ada yang rusak</SelectItem>
                        <SelectItem value="WRONG_ITEM">Ada yang tidak sesuai</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {bad && (
                    <div className="space-y-1">
                      <Label className="text-xs">Jumlah ditolak</Label>
                      <QtyInput value={r.rejected} onValueChange={(v) => set(l.id, { rejected: v })} placeholder="0" />
                    </div>
                  )}
                  <div className={cn("space-y-1", !bad && "sm:col-span-2")}>
                    <Label className="text-xs">Catatan</Label>
                    <Input value={r.notes} onChange={(e) => set(l.id, { notes: e.target.value })} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            disabled={!hasAny || receipt.pending}
            onClick={() =>
              void receipt.run(
                data.po.id,
                {
                  ...meta,
                  receivedAt: meta.receivedAt ? new Date(`${meta.receivedAt}T12:00:00`).toISOString() : null,
                  lines: Object.entries(rows)
                    .filter(([, r]) => Number(r.received) > 0)
                    .map(([purchaseOrderItemId, r]) => ({
                      purchaseOrderItemId,
                      quantityReceived: r.received,
                      quantityRejected: r.condition === "GOOD" ? "0" : r.rejected || "0",
                      condition: r.condition,
                      notes: r.notes,
                    })),
                },
                key.current,
              )
            }
          >
            {receipt.pending && <Loader2 className="size-4 animate-spin" />} Simpan penerimaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShortageDialog({ data }: { data: PoDetail }) {
  const lines = data.lines.filter((l) => Number(l.outstanding) > 0);
  const [open, setOpen] = useState(false);
  const [lineId, setLineId] = useState(lines[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [desc, setDesc] = useState("");
  const report = useAction(reportShortageAction, { onSuccess: () => setOpen(false) });
  if (!lines.length) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <AlertTriangle className="size-4" /> Laporkan kekurangan
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vendor tidak dapat memenuhi kuantitas</DialogTitle>
          <DialogDescription>Catat kekurangan, lalu ajukan penyelesaiannya (pengganti atau terima kekurangan).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Select value={lineId} onValueChange={setLineId}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lines.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.itemName} (sisa {formatQty(l.outstanding)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-1.5">
            <Label>Jumlah yang tidak dapat dipenuhi</Label>
            <QtyInput value={qty} onValueChange={setQty} />
          </div>
          <div className="space-y-1.5">
            <Label>Keterangan *</Label>
            <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!qty || !desc.trim() || report.pending} onClick={() => void report.run(data.po.id, lineId, qty, desc)}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResolutionDialog({ discrepancyId, type }: { discrepancyId: string; type: string }) {
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<ResolutionType>(type === "SHORTAGE" ? "ACCEPT_SHORTAGE" : "REPLACEMENT");
  const [note, setNote] = useState("");
  const propose = useAction(proposeResolutionAction, {
    success: (d) =>
      d.status === "APPROVED" ? "Penyelesaian diterapkan." : d.status === "ON_HOLD" ? `Ditahan: ${d.holdReason}` : "Usulan dikirim untuk persetujuan.",
    onSuccess: () => setOpen(false),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Ajukan penyelesaian</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajukan penyelesaian</DialogTitle>
          <DialogDescription>Penyelesaian resmi disetujui sesuai matriks sebelum transaksi dilanjutkan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {(Object.keys(RESOLUTION_TYPE) as ResolutionType[]).map((r) => (
            <label key={r} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3", res === r && "border-primary bg-primary/5")}>
              <input type="radio" name="res" className="mt-1" checked={res === r} onChange={() => setRes(r)} />
              <span>
                <span className="block text-sm font-medium">{RESOLUTION_TYPE[r].label}</span>
                <span className="block text-xs text-muted-foreground">{RESOLUTION_TYPE[r].description}</span>
              </span>
            </label>
          ))}
          <Label htmlFor="res-note">Catatan *</Label>
          <Textarea id="res-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button disabled={!note.trim() || propose.pending} onClick={() => void propose.run(discrepancyId, res, note)}>
            {propose.pending && <Loader2 className="size-4 animate-spin" />} Kirim usulan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tindak lanjut & catatan
// ---------------------------------------------------------------------------

export function FollowupForm({ data }: { data: PoDetail }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    followupType: "DELAY" as FollowupType,
    reason: "",
    newEta: "",
    actionTaken: "",
    actionDate: today(),
    responsibleUserId: data.po.owner.id,
    vendorResponse: "",
    targetResolutionDate: "",
  });
  const add = useAction(addFollowupAction, {
    onSuccess: () => {
      setOpen(false);
      setF((x) => ({ ...x, reason: "", newEta: "", actionTaken: "", vendorResponse: "", targetResolutionDate: "" }));
    },
  });
  const delay = f.followupType === "DELAY";
  if (["CLOSED", "CANCELLED"].includes(data.po.status)) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Truck className="size-4" /> Catat tindak lanjut
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tindak lanjut vendor</DialogTitle>
          <DialogDescription>Keterlambatan wajib mencatat alasan, perkiraan baru, tindakan, penanggung jawab, dan target penyelesaian.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Jenis</Label>
              <Select value={f.followupType} onValueChange={(v) => setF({ ...f, followupType: v as FollowupType })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FOLLOWUP_TYPE) as FollowupType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {FOLLOWUP_TYPE[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal tindakan</Label>
              <Input type="date" value={f.actionDate} onChange={(e) => setF({ ...f, actionDate: e.target.value })} />
            </div>
          </div>
          {delay && (
            <div className="space-y-1.5">
              <Label>Alasan keterlambatan *</Label>
              <Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Tindakan yang dilakukan *</Label>
            <Textarea rows={2} value={f.actionTaken} onChange={(e) => setF({ ...f, actionTaken: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Respons vendor</Label>
            <Input value={f.vendorResponse} onChange={(e) => setF({ ...f, vendorResponse: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Perkiraan tiba baru {delay && "*"}</Label>
              <Input type="date" value={f.newEta} onChange={(e) => setF({ ...f, newEta: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Target penyelesaian {delay && "*"}</Label>
              <Input type="date" value={f.targetResolutionDate} onChange={(e) => setF({ ...f, targetResolutionDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Penanggung jawab</Label>
            <Select value={f.responsibleUserId} onValueChange={(v) => setF({ ...f, responsibleUserId: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.purchasingUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            disabled={add.pending || !f.actionTaken.trim()}
            onClick={() =>
              void add.run(data.po.id, {
                ...f,
                newEta: f.newEta || null,
                targetResolutionDate: f.targetResolutionDate || null,
                reason: f.reason || null,
                vendorResponse: f.vendorResponse || null,
              })
            }
          >
            {add.pending && <Loader2 className="size-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PoNoteBox({ poId }: { poId: string }) {
  const [body, setBody] = useState("");
  const add = useAction(addPoCommentAction, { onSuccess: () => setBody("") });
  return (
    <div className="space-y-2">
      <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Catatan internal purchasing…" />
      <div className="flex justify-end">
        <Button size="sm" variant="outline" disabled={!body.trim() || add.pending} onClick={() => void add.run(poId, body)}>
          <ClipboardList className="size-4" /> Simpan catatan
        </Button>
      </div>
    </div>
  );
}
