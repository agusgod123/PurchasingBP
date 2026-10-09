"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldHint } from "@/components/app/form-bits";
import { useAction } from "@/components/app/use-action";
import { PRIORITY, TICKET_CATEGORY } from "@/lib/status";
import { createTicketAction } from "../actions";

type Category = keyof typeof TICKET_CATEGORY;
type Urgency = keyof typeof PRIORITY;

const EMPTY = { subject: "", description: "", category: "TECHNICAL" as Category, urgency: "NORMAL" as Urgency, relatedRequestNumber: "" };

export function NewTicketDialog({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [f, setF] = useState(EMPTY);
  const create = useAction(createTicketAction, {
    refresh: false,
    onSuccess: (d) => {
      setOpen(false);
      setF(EMPTY);
      router.push(`/bantuan/tiket/${d.id}`);
    },
  });
  const fe = create.fieldErrors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Buat tiket
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Buat tiket bantuan</DialogTitle>
          <DialogDescription>Jelaskan kendala Anda selengkap mungkin agar Admin bisa cepat membantu.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="t-subject">Judul *</Label>
            <Input
              id="t-subject"
              value={f.subject}
              placeholder="mis. Tidak bisa mengunggah penawaran vendor"
              onChange={(e) => setF({ ...f, subject: e.target.value })}
              aria-invalid={!!fe.subject}
            />
            <FieldHint error={fe.subject} />
          </div>
          <div className="space-y-1.5">
            <Label>Kategori</Label>
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v as Category })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TICKET_CATEGORY).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Urgensi</Label>
            <Select value={f.urgency} onValueChange={(v) => setF({ ...f, urgency: v as Urgency })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITY).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="t-desc">Penjelasan *</Label>
            <Textarea
              id="t-desc"
              rows={5}
              value={f.description}
              placeholder="Apa yang Anda lakukan, apa yang terjadi, dan apa yang Anda harapkan?"
              onChange={(e) => setF({ ...f, description: e.target.value })}
              aria-invalid={!!fe.description}
            />
            <FieldHint error={fe.description} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="t-req">No. pengajuan terkait</Label>
            <Input
              id="t-req"
              value={f.relatedRequestNumber}
              placeholder="opsional, mis. PB-2026-00012"
              onChange={(e) => setF({ ...f, relatedRequestNumber: e.target.value.toUpperCase() })}
              aria-invalid={!!fe.relatedRequestNumber}
            />
            <FieldHint error={fe.relatedRequestNumber} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button disabled={create.pending} onClick={() => void create.run(f)}>
            {create.pending && <Loader2 className="size-4 animate-spin" />} Kirim tiket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
