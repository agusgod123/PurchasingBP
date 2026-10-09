"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { CalendarClock, Loader2, MinusCircle, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { MoneyInput, QtyInput } from "@/components/app/inputs";
import { PriorityBadge, StatusBadge } from "@/components/app/ui";
import { useAction } from "@/components/app/use-action";
import { formatCurrency, formatDateOnly, formatQty } from "@/lib/format";
import { PO_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { QueueRequest } from "@/server/queries/purchasing";
import { createPoAction, reduceQuantityAction } from "../actions";

interface Selected {
  requestItemId: string;
  itemName: string;
  unitName: string;
  requestNumber: string | null;
  quantity: string;
  unitPrice: string;
  max: string;
}

export function QueueBoard({ queue, vendors }: { queue: QueueRequest[]; vendors: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, Selected>>({});
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState<string>("");
  const [title, setTitle] = useState("");
  const key = useRef(crypto.randomUUID());
  const create = useAction(createPoAction, {
    onSuccess: (d) => {
      setOpen(false);
      setSelected({});
      key.current = crypto.randomUUID();
      router.push(`/purchasing/po/${d.id}`);
    },
    success: (d) => `${d.poNumber} dibuat sebagai draf.`,
  });
  const reduce = useAction(reduceQuantityAction, {
    success: (d) => (d.status === "ON_HOLD" ? `Usulan dibuat tetapi ditahan: ${d.holdReason}` : "Usulan pengurangan dikirim untuk persetujuan pemohon & atasan."),
  });

  const list = Object.values(selected);
  const total = useMemo(() => list.reduce((a, s) => a + (Number(s.quantity) || 0) * (Number(s.unitPrice) || 0), 0), [list]);
  const requestsSelected = new Set(list.map((s) => s.requestNumber)).size;

  const toggle = (r: QueueRequest, it: QueueRequest["items"][number], checked: boolean) =>
    setSelected((cur) => {
      const next = { ...cur };
      if (checked)
        next[it.requestItemId] = {
          requestItemId: it.requestItemId,
          itemName: it.itemName,
          unitName: it.unitName,
          requestNumber: r.requestNumber,
          quantity: it.remaining,
          unitPrice: String(Math.round(Number(it.estimatedUnitPrice))),
          max: it.remaining,
        };
      else delete next[it.requestItemId];
      return next;
    });

  return (
    <>
      <div className="space-y-3 pb-24">
        {queue.map((r) => (
          <div key={r.requestId} className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-col gap-2 border-b bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/pengajuan/${r.requestId}`} className="text-sm font-semibold hover:underline">
                    {r.requestNumber}
                  </Link>
                  <PriorityBadge priority={r.priority} />
                  {r.openPos.map((p) => (
                    <Link key={p.id} href={`/purchasing/po/${p.id}`}>
                      <StatusBadge label={`${p.poNumber} · ${PO_STATUS[p.status].label}`} tone="neutral" />
                    </Link>
                  ))}
                </div>
                <div className="truncate text-sm">{r.title}</div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {r.requester} · {r.department}
                </span>
                <span className={cn("inline-flex items-center gap-1", r.overdue && "font-medium text-red-600")}>
                  <CalendarClock className="size-3.5" /> Dibutuhkan {formatDateOnly(r.neededDate)}
                </span>
              </div>
            </div>
            <ul className="divide-y">
              {r.items.map((it) => {
                const checked = !!selected[it.requestItemId];
                return (
                  <li key={it.requestItemId} className={cn("flex items-start gap-3 px-4 py-3", checked && "bg-primary/[0.03]")}>
                    <Checkbox
                      className="mt-0.5"
                      checked={checked}
                      onCheckedChange={(v) => toggle(r, it, v === true)}
                      aria-label={`Pilih ${it.itemName}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{it.itemName}</div>
                      <div className="text-[13px] text-muted-foreground">{it.specification}</div>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      <div className="tabular font-medium">
                        {formatQty(it.remaining)} {it.unitName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {Number(it.allocated) > 0 ? `${formatQty(it.allocated)} sudah dipesan · ` : ""}est. {formatCurrency(it.estimatedUnitPrice)}
                      </div>
                    </div>
                    <ReasonDialog
                      trigger={
                        <Button variant="ghost" size="icon" aria-label="Kurangi kebutuhan" title="Usulkan pengurangan jumlah">
                          <MinusCircle className="size-4 text-muted-foreground" />
                        </Button>
                      }
                      title={`Kurangi jumlah ${it.itemName}`}
                      description="Pengurangan kebutuhan memerlukan persetujuan pemohon dan atasannya."
                      label="Alasan"
                      confirmText="Ajukan pengurangan"
                      onConfirm={async (reason) => {
                        const qty = (document.getElementById(`reduce-${it.requestItemId}`) as HTMLInputElement | null)?.value ?? "";
                        return reduce.run(it.requestItemId, qty.replace(",", "."), reason);
                      }}
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor={`reduce-${it.requestItemId}`}>Jumlah kebutuhan baru ({it.unitName})</Label>
                        <Input id={`reduce-${it.requestItemId}`} inputMode="decimal" defaultValue={it.allocated !== "0" ? it.allocated : ""} />
                        <p className="text-xs text-muted-foreground">
                          Saat ini {formatQty(it.required)}, sudah dipesan {formatQty(it.allocated)}.
                        </p>
                      </div>
                    </ReasonDialog>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {list.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-[min(640px,calc(100%-2rem))] items-center gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur md:left-[calc(var(--sidebar-width)+1rem)] md:mx-0 md:w-auto md:right-6">
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium">
              {list.length} item dari {requestsSelected} pengajuan
            </div>
            <div className="text-xs text-muted-foreground">Estimasi {formatCurrency(total)}</div>
          </div>
          <Button variant="ghost" onClick={() => setSelected({})}>
            Batal
          </Button>
          <Button onClick={() => setOpen(true)}>
            <ShoppingCart className="size-4" /> Buat PO
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Buat PO dari {list.length} item</DialogTitle>
            <DialogDescription>
              Beberapa pengajuan dapat digabung dalam satu PO; setiap baris tetap terhubung ke pengajuan asal. Harga dan vendor dapat diubah nanti.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Vendor (opsional)</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
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
              <Label htmlFor="po-title">Judul PO (opsional)</Label>
              <Input id="po-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: ATK Oktober" />
            </div>
          </div>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {list.map((s) => (
              <div key={s.requestItemId} className="grid grid-cols-[1fr_96px_150px] items-center gap-2 rounded-lg border p-2.5">
                <div className="min-w-0 text-sm">
                  <div className="truncate font-medium">{s.itemName}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.requestNumber} · sisa {formatQty(s.max)} {s.unitName}
                  </div>
                </div>
                <QtyInput
                  value={s.quantity}
                  onValueChange={(v) => setSelected((cur) => ({ ...cur, [s.requestItemId]: { ...s, quantity: v } }))}
                  aria-label="Jumlah dipesan"
                />
                <MoneyInput
                  value={s.unitPrice}
                  onValueChange={(v) => setSelected((cur) => ({ ...cur, [s.requestItemId]: { ...s, unitPrice: v } }))}
                  aria-label="Harga satuan"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Jumlah lebih kecil dari sisa → sisanya tetap di antrean. Harga/jumlah yang berbeda dari pengajuan akan meminta persetujuan pemohon & atasan saat PO ditandai siap.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              disabled={create.pending}
              onClick={() =>
                void create.run(
                  {
                    vendorId: vendorId || null,
                    title: title || null,
                    lines: list.map((s) => ({ requestItemId: s.requestItemId, quantity: s.quantity, unitPrice: s.unitPrice || null })),
                  },
                  key.current,
                )
              }
            >
              {create.pending && <Loader2 className="size-4 animate-spin" />} Buat PO ({formatCurrency(total)})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
