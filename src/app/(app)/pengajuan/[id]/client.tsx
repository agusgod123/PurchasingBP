"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Ban, ClipboardCheck, Loader2, PackageCheck, Pencil, RotateCcw, Send, Trash2, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { QtyInput } from "@/components/app/inputs";
import { useAction } from "@/components/app/use-action";
import { PRIORITY } from "@/lib/status";
import { formatQty } from "@/lib/format";
import type { Priority } from "@/generated/prisma/enums";
import {
  addCommentAction,
  cancelHandoverAction,
  cancelRequestAction,
  confirmHandoverAction,
  decideCancellationAction,
  deleteDraftAction,
  prepareHandoverAction,
  rerouteRequestAction,
  setPriorityAction,
  withdrawRequestAction,
} from "../actions";

interface Actions {
  canEdit: boolean;
  canSubmit: boolean;
  canDeleteDraft: boolean;
  canWithdraw: boolean;
  canCancel: boolean;
  cancelNeedsApproval: boolean;
  canReroute: boolean;
  myPendingAssignmentId: string | null;
  canDecideCancellation: boolean;
  pendingCancellationId: string | null;
}

export function RequestActionsBar({ id, actions }: { id: string; actions: Actions }) {
  const router = useRouter();
  const withdraw = useAction(withdrawRequestAction);
  const cancel = useAction(cancelRequestAction, {
    success: (d) => (d.status === "CANCELLED" ? "Pengajuan dibatalkan." : "Usulan pembatalan dikirim."),
  });
  const remove = useAction(deleteDraftAction, { onSuccess: () => router.push("/pengajuan"), refresh: false });
  const reroute = useAction(rerouteRequestAction, {
    success: (d) => (d.status === "ON_HOLD" ? `Masih ditahan: ${d.holdReason}` : "Jalur persetujuan berhasil diproses ulang."),
  });
  const decideCancel = useAction(decideCancellationAction);

  return (
    <>
      {actions.myPendingAssignmentId && (
        <Button asChild>
          <Link href={`/persetujuan/${actions.myPendingAssignmentId}`}>
            <ClipboardCheck className="size-4" /> Beri keputusan
          </Link>
        </Button>
      )}
      {actions.canEdit && (
        <Button asChild variant={actions.myPendingAssignmentId ? "outline" : "default"}>
          <Link href={`/pengajuan/${id}/edit`}>
            {actions.canSubmit ? <Send className="size-4" /> : <Pencil className="size-4" />}
            Ubah & kirim
          </Link>
        </Button>
      )}
      {actions.canWithdraw && (
        <ReasonDialog
          trigger={
            <Button variant="outline">
              <Undo2 className="size-4" /> Tarik untuk diedit
            </Button>
          }
          title="Tarik pengajuan?"
          description="Proses persetujuan yang sedang berjalan dihentikan. Anda dapat mengedit lalu mengirim ulang; riwayat tetap tersimpan."
          required={false}
          label="Catatan (opsional)"
          confirmText="Tarik pengajuan"
          onConfirm={(reason) => withdraw.run(id, reason)}
        />
      )}
      {actions.canReroute && (
        <Button variant="outline" onClick={() => void reroute.run(id)} disabled={reroute.pending}>
          {reroute.pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Proses ulang persetujuan
        </Button>
      )}
      {actions.canDecideCancellation && actions.pendingCancellationId && (
        <>
          <ReasonDialog
            trigger={
              <Button variant="destructive">
                <Ban className="size-4" /> Setujui pembatalan
              </Button>
            }
            title="Setujui pembatalan?"
            description="Pengajuan akan dibatalkan dan baris PO terkait dihentikan."
            required={false}
            label="Catatan"
            confirmText="Batalkan pengajuan"
            destructive
            onConfirm={(note) => decideCancel.run(actions.pendingCancellationId!, true, note)}
          />
          <ReasonDialog
            trigger={<Button variant="outline">Tolak pembatalan</Button>}
            title="Tolak usulan pembatalan?"
            label="Alasan"
            confirmText="Tolak"
            onConfirm={(note) => decideCancel.run(actions.pendingCancellationId!, false, note)}
          />
        </>
      )}
      {actions.canCancel && (
        <ReasonDialog
          trigger={
            <Button variant="ghost" className="text-destructive hover:text-destructive">
              <XCircle className="size-4" /> {actions.cancelNeedsApproval ? "Usulkan pembatalan" : "Batalkan"}
            </Button>
          }
          title={actions.cancelNeedsApproval ? "Usulkan pembatalan" : "Batalkan pengajuan?"}
          description={
            actions.cancelNeedsApproval
              ? "Pengajuan sudah disetujui. Pembatalan akan diproses Purchasing atau melalui persetujuan sesuai tahap transaksi."
              : "Pengajuan dibatalkan dan tetap tersimpan sebagai riwayat."
          }
          placeholder="Contoh: kebutuhan sudah terpenuhi dari stok lain"
          confirmText={actions.cancelNeedsApproval ? "Kirim usulan" : "Batalkan pengajuan"}
          destructive
          onConfirm={(reason) => cancel.run(id, reason)}
        />
      )}
      {actions.canDeleteDraft && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="text-destructive hover:text-destructive">
              <Trash2 className="size-4" /> Hapus draf
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus draf ini?</AlertDialogTitle>
              <AlertDialogDescription>Draf belum pernah dikirim sehingga dapat dihapus permanen beserta lampirannya.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction onClick={() => void remove.run(id)}>Hapus</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

export function PrioritySelect({ id, value }: { id: string; value: Priority | null }) {
  const setPriority = useAction(setPriorityAction);
  return (
    <Select value={value ?? undefined} onValueChange={(v) => void setPriority.run(id, v as Priority)} disabled={setPriority.pending}>
      <SelectTrigger size="sm" className="h-8 w-40">
        <SelectValue placeholder="Tetapkan prioritas" />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(PRIORITY) as Priority[]).map((p) => (
          <SelectItem key={p} value={p}>
            {PRIORITY[p].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CommentBox({ id }: { id: string }) {
  const [body, setBody] = useState("");
  const comment = useAction(addCommentAction, { onSuccess: () => setBody("") });
  return (
    <div className="space-y-2">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Tulis komentar atau pertanyaan…" rows={2} />
      <div className="flex justify-end">
        <Button size="sm" onClick={() => void comment.run(id, body)} disabled={!body.trim() || comment.pending}>
          {comment.pending && <Loader2 className="size-4 animate-spin" />} Kirim komentar
        </Button>
      </div>
    </div>
  );
}

export function PrepareHandoverButton({
  requestId,
  items,
}: {
  requestId: string;
  items: Array<{ requestItemId: string; itemName: string; unitName: string; available: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(items.map((i) => [i.requestItemId, i.available])));
  const key = useRef(crypto.randomUUID());
  const prepare = useAction(prepareHandoverAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PackageCheck className="size-4" /> Siapkan serah terima
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Siapkan serah terima</DialogTitle>
          <DialogDescription>Pemohon akan diberi tahu untuk mengambil dan mengonfirmasi barang.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            {items.map((i) => (
              <div key={i.requestItemId} className="flex items-center gap-3">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate font-medium">{i.itemName}</div>
                  <div className="text-xs text-muted-foreground">
                    Tersedia {formatQty(i.available)} {i.unitName}
                  </div>
                </div>
                <QtyInput className="w-24" value={qty[i.requestItemId] ?? ""} onValueChange={(v) => setQty((q) => ({ ...q, [i.requestItemId]: v }))} />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="loc">Lokasi pengambilan</Label>
            <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Contoh: Gudang lantai 1" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            disabled={prepare.pending}
            onClick={() =>
              void prepare.run(
                requestId,
                {
                  location,
                  notes,
                  items: Object.entries(qty)
                    .filter(([, v]) => Number(v) > 0)
                    .map(([requestItemId, quantity]) => ({ requestItemId, quantity })),
                },
                key.current,
              )
            }
          >
            {prepare.pending && <Loader2 className="size-4 animate-spin" />} Siapkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmHandoverForm({
  handover,
}: {
  handover: { id: string; items: Array<{ id: string; itemName: string; unitName: string; quantity: string }> };
}) {
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(handover.items.map((i) => [i.id, i.quantity])));
  const [note, setNote] = useState("");
  const confirm = useAction(confirmHandoverAction, {
    success: (d) =>
      d.status === "DISPUTED" ? "Selisih dilaporkan ke Purchasing." : "completed" in d && d.completed ? "Terima kasih! Pengajuan selesai." : "Penerimaan dikonfirmasi.",
  });
  const mismatch = handover.items.some((i) => Number(qty[i.id]) !== Number(i.quantity));
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900 dark:bg-violet-950/30">
      <div>
        <div className="font-medium">Konfirmasi penerimaan barang</div>
        <p className="text-[13px] text-muted-foreground">Periksa barang. Ubah jumlah bila yang diterima tidak sesuai.</p>
      </div>
      <div className="space-y-2">
        {handover.items.map((i) => (
          <div key={i.id} className="flex items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <div className="truncate">{i.itemName}</div>
              <div className="text-xs text-muted-foreground">
                Diserahkan {formatQty(i.quantity)} {i.unitName}
              </div>
            </div>
            <QtyInput className="w-24 bg-background" value={qty[i.id] ?? ""} onValueChange={(v) => setQty((q) => ({ ...q, [i.id]: v }))} aria-label={`Jumlah diterima ${i.itemName}`} />
          </div>
        ))}
      </div>
      {mismatch && (
        <div className="space-y-1.5">
          <Label htmlFor="note">Jelaskan selisih *</Label>
          <Textarea id="note" className="bg-background" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      <Button
        onClick={() =>
          void confirm.run(
            handover.id,
            Object.entries(qty).map(([handoverItemId, confirmedQuantity]) => ({ handoverItemId, confirmedQuantity: confirmedQuantity || "0" })),
            note,
          )
        }
        disabled={confirm.pending || (mismatch && !note.trim())}
      >
        {confirm.pending && <Loader2 className="size-4 animate-spin" />}
        {mismatch ? "Laporkan selisih" : "Konfirmasi barang diterima"}
      </Button>
    </div>
  );
}

export function CancelHandoverButton({ handoverId }: { handoverId: string }) {
  const cancel = useAction(cancelHandoverAction);
  return (
    <ReasonDialog
      trigger={
        <Button variant="ghost" size="sm">
          Batalkan serah terima
        </Button>
      }
      title="Batalkan serah terima?"
      confirmText="Batalkan"
      destructive
      onConfirm={(reason) => cancel.run(handoverId, reason)}
    />
  );
}
