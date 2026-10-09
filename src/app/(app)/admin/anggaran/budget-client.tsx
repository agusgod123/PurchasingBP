"use client";

import { useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldHint } from "@/components/app/form-bits";
import { MoneyInput } from "@/components/app/inputs";
import { useAction } from "@/components/app/use-action";
import { deleteBudgetAction, saveBudgetAction } from "../actions";

export function BudgetDialog({
  departmentId,
  departmentName,
  year,
  existing,
}: {
  departmentId: string;
  departmentName: string;
  year: number;
  existing: { id: string; amount: string; notes: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(existing?.amount ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const save = useAction(saveBudgetAction, { onSuccess: () => setOpen(false) });
  const del = useAction(deleteBudgetAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setAmount(existing?.amount ?? "");
          setNotes(existing?.notes ?? "");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Atur anggaran ${departmentName}`}>
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Anggaran {departmentName}</DialogTitle>
          <DialogDescription>Tahun anggaran {year}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Pagu *</Label>
            <MoneyInput value={amount} onValueChange={setAmount} aria-invalid={!!save.fieldErrors.amount} autoFocus />
            <FieldHint error={save.fieldErrors.amount} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-notes">Catatan</Label>
            <Textarea id="b-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="mis. Revisi RKA Juli" />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {existing ? (
            <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={del.pending} onClick={() => confirm("Hapus pagu ini?") && void del.run(existing.id)}>
              <Trash2 className="size-4" /> Hapus
            </Button>
          ) : (
            <span />
          )}
          <Button disabled={save.pending || !amount} onClick={() => void save.run({ departmentId, fiscalYear: year, amount, notes: notes || null })}>
            {save.pending && <Loader2 className="size-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
