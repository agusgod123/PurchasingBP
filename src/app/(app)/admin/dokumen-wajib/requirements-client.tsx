"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldHint } from "@/components/app/form-bits";
import { MoneyInput } from "@/components/app/inputs";
import { useAction } from "@/components/app/use-action";
import { DOCUMENT_STAGE, DOCUMENT_TYPE } from "@/lib/status";
import { deleteDocRequirementAction, saveDocRequirementAction } from "../actions";

type Stage = keyof typeof DOCUMENT_STAGE;
type DocType = keyof typeof DOCUMENT_TYPE;
interface Form {
  id?: string;
  stage: Stage;
  documentType: DocType;
  minCount: string;
  minAmount: string;
  description: string;
  isActive: boolean;
}
const EMPTY: Form = { stage: "REQUEST_SUBMIT", documentType: "REQUEST_ATTACHMENT", minCount: "1", minAmount: "", description: "", isActive: true };

export function RequirementDialog({ requirement }: { requirement?: Form }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Form>(requirement ?? EMPTY);
  const save = useAction(saveDocRequirementAction, { onSuccess: () => setOpen(false) });
  const del = useAction(deleteDocRequirementAction, { onSuccess: () => setOpen(false) });
  const fe = save.fieldErrors;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(requirement ?? EMPTY);
      }}
    >
      <DialogTrigger asChild>
        {requirement ? (
          <Button variant="ghost" size="icon" aria-label="Ubah ketentuan">
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" /> Tambah ketentuan
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{requirement ? "Ubah ketentuan dokumen" : "Tambah ketentuan dokumen"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Tahap</Label>
            <Select value={f.stage} onValueChange={(v) => setF({ ...f, stage: v as Stage })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_STAGE).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Jenis dokumen</Label>
            <Select value={f.documentType} onValueChange={(v) => setF({ ...f, documentType: v as DocType })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_TYPE).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dr-count">Jumlah</Label>
              <Input id="dr-count" type="number" min={1} max={20} value={f.minCount} onChange={(e) => setF({ ...f, minCount: e.target.value })} aria-invalid={!!fe.minCount} />
            </div>
            <div className="space-y-1.5">
              <Label>Hanya jika nilai ≥</Label>
              <MoneyInput value={f.minAmount} onValueChange={(v) => setF({ ...f, minAmount: v })} placeholder="semua nilai" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dr-desc">Keterangan untuk pengguna</Label>
            <Textarea id="dr-desc" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            <FieldHint hint="Ditampilkan saat dokumen belum lengkap." />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} /> Aktif
          </label>
        </div>
        <DialogFooter className="sm:justify-between">
          {requirement?.id ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={del.pending}
              onClick={() => {
                if (confirm("Hapus ketentuan ini?")) void del.run(requirement.id!);
              }}
            >
              <Trash2 className="size-4" /> Hapus
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              disabled={save.pending}
              onClick={() => void save.run(requirement?.id ?? null, { ...f, minAmount: f.minAmount || null, description: f.description || null })}
            >
              {save.pending && <Loader2 className="size-4 animate-spin" />} Simpan
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
