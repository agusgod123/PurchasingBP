"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldHint } from "@/components/app/form-bits";
import { useAction } from "@/components/app/use-action";
import { saveVendorAction } from "../actions";

export interface VendorForm {
  id?: string;
  code: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  taxNumber: string;
  notes: string;
  isActive: boolean;
}

const EMPTY: VendorForm = { code: "", name: "", contactPerson: "", email: "", phone: "", address: "", taxNumber: "", notes: "", isActive: true };

export function VendorDialog({ vendor }: { vendor?: VendorForm }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<VendorForm>(vendor ?? EMPTY);
  const save = useAction(saveVendorAction, { onSuccess: () => setOpen(false) });
  const fe = save.fieldErrors;
  const field = (k: keyof VendorForm, label: string, opts: { type?: string; required?: boolean } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`v-${k}`}>
        {label} {opts.required && "*"}
      </Label>
      <Input id={`v-${k}`} type={opts.type} value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-invalid={!!fe[k]} />
      <FieldHint error={fe[k]} />
    </div>
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(vendor ?? EMPTY);
      }}
    >
      <DialogTrigger asChild>
        {vendor ? (
          <Button variant="ghost" size="icon" aria-label="Ubah vendor">
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" /> Tambah vendor
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{vendor ? "Ubah vendor" : "Tambah vendor"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("code", "Kode", { required: true })}
          {field("name", "Nama", { required: true })}
          {field("contactPerson", "Narahubung")}
          {field("phone", "Telepon")}
          {field("email", "Email", { type: "email" })}
          {field("taxNumber", "NPWP")}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="v-address">Alamat</Label>
            <Textarea id="v-address" rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="v-notes">Catatan</Label>
            <Textarea id="v-notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} /> Aktif
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button disabled={save.pending} onClick={() => void save.run(vendor?.id ?? null, f)}>
            {save.pending && <Loader2 className="size-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
