"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldHint } from "@/components/app/form-bits";
import { useAction } from "@/components/app/use-action";
import { deleteFaqAction, saveFaqAction } from "./actions";

export interface FaqForm {
  category: string;
  question: string;
  answer: string;
  sortOrder: number;
  isPublished: boolean;
}

const EMPTY: FaqForm = { category: "", question: "", answer: "", sortOrder: 0, isPublished: true };

export function FaqDialog({ faq, categories }: { faq?: FaqForm & { id: string }; categories: string[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<FaqForm>(faq ?? EMPTY);
  const save = useAction(saveFaqAction, { onSuccess: () => setOpen(false) });
  const del = useAction(deleteFaqAction, { onSuccess: () => setOpen(false) });
  const fe = save.fieldErrors;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(faq ?? EMPTY);
      }}
    >
      <DialogTrigger asChild>
        {faq ? (
          <Button variant="ghost" size="icon" aria-label="Ubah FAQ">
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" /> Tambah FAQ
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{faq ? "Ubah FAQ" : "Tambah FAQ"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <div className="space-y-1.5">
            <Label htmlFor="faq-cat">Kategori *</Label>
            <Input id="faq-cat" list="faq-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-invalid={!!fe.category} />
            <datalist id="faq-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <FieldHint error={fe.category} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="faq-order">Urutan</Label>
            <Input id="faq-order" type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="faq-q">Pertanyaan *</Label>
            <Input id="faq-q" value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} aria-invalid={!!fe.question} />
            <FieldHint error={fe.question} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="faq-a">Jawaban *</Label>
            <Textarea id="faq-a" rows={7} value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} aria-invalid={!!fe.answer} />
            <FieldHint error={fe.answer} hint="Teks biasa; baris baru dipertahankan." />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={f.isPublished} onCheckedChange={(v) => setF({ ...f, isPublished: v })} /> Tampilkan ke pengguna
          </label>
        </div>
        <DialogFooter className="sm:justify-between">
          {faq ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={del.pending}
              onClick={() => {
                if (confirm("Hapus FAQ ini?")) void del.run(faq.id);
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
            <Button disabled={save.pending} onClick={() => void save.run(faq?.id ?? null, f)}>
              {save.pending && <Loader2 className="size-4 animate-spin" />} Simpan
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
