"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldHint } from "@/components/app/form-bits";
import { MoneyInput } from "@/components/app/inputs";
import type { SearchOption } from "@/components/app/search-select";
import { useAction } from "@/components/app/use-action";
import { saveCatalogItemAction, saveCategoryAction } from "../actions";

interface CategoryForm {
  id?: string;
  code: string;
  name: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
}

export function CategoryDialog({ category }: { category?: CategoryForm }) {
  const empty: CategoryForm = { code: "", name: "", description: "", sortOrder: "0", isActive: true };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<CategoryForm>(category ?? empty);
  const save = useAction(saveCategoryAction, { onSuccess: () => setOpen(false) });
  const fe = save.fieldErrors;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(category ?? empty);
      }}
    >
      <DialogTrigger asChild>
        {category ? (
          <Button variant="ghost" size="icon" aria-label={`Ubah ${category.name}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" /> Tambah kategori
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? "Ubah kategori" : "Tambah kategori"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-code">Kode *</Label>
              <Input id="c-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} aria-invalid={!!fe.code} />
              <FieldHint error={fe.code} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Nama *</Label>
              <Input id="c-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!fe.name} />
              <FieldHint error={fe.name} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-desc">Keterangan</Label>
            <Textarea id="c-desc" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="w-28 space-y-1.5">
              <Label htmlFor="c-order">Urutan</Label>
              <Input id="c-order" type="number" min={0} value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} /> Aktif
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button disabled={save.pending} onClick={() => void save.run(category?.id ?? null, { ...f, description: f.description || null })}>
            {save.pending && <Loader2 className="size-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ItemForm {
  id?: string;
  categoryId: string;
  code: string;
  name: string;
  description: string;
  itemType: "GOODS" | "SERVICE";
  unitName: string;
  defaultEstimatedPrice: string;
  isActive: boolean;
}

export function CatalogItemDialog({ item, categories }: { item?: ItemForm; categories: SearchOption[] }) {
  const empty: ItemForm = { categoryId: categories[0]?.value ?? "", code: "", name: "", description: "", itemType: "GOODS", unitName: "unit", defaultEstimatedPrice: "", isActive: true };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<ItemForm>(item ?? empty);
  const save = useAction(saveCatalogItemAction, { onSuccess: () => setOpen(false) });
  const fe = save.fieldErrors;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(item ?? empty);
      }}
    >
      <DialogTrigger asChild>
        {item ? (
          <Button variant="ghost" size="icon" aria-label={`Ubah ${item.name}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button className="h-9">
            <Plus className="size-4" /> Tambah barang
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Ubah barang" : "Tambah barang"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="i-name">Nama *</Label>
            <Input id="i-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!fe.name} />
            <FieldHint error={fe.name} />
          </div>
          <div className="space-y-1.5">
            <Label>Kategori *</Label>
            <Select value={f.categoryId} onValueChange={(v) => setF({ ...f, categoryId: v })}>
              <SelectTrigger className="w-full" aria-invalid={!!fe.categoryId}>
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldHint error={fe.categoryId} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="i-code">Kode</Label>
            <Input id="i-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} aria-invalid={!!fe.code} />
            <FieldHint error={fe.code} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="i-desc">Spesifikasi standar</Label>
            <Textarea id="i-desc" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="i-unit">Satuan *</Label>
            <Input id="i-unit" value={f.unitName} onChange={(e) => setF({ ...f, unitName: e.target.value })} aria-invalid={!!fe.unitName} />
            <FieldHint error={fe.unitName} />
          </div>
          <div className="space-y-1.5">
            <Label>Estimasi harga satuan</Label>
            <MoneyInput value={f.defaultEstimatedPrice} onValueChange={(v) => setF({ ...f, defaultEstimatedPrice: v })} />
          </div>
          <div className="space-y-1.5">
            <Label>Jenis</Label>
            <Select value={f.itemType} onValueChange={(v) => setF({ ...f, itemType: v as ItemForm["itemType"] })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GOODS">Barang</SelectItem>
                <SelectItem value="SERVICE">Jasa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} /> Tampil di pilihan pemohon
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            disabled={save.pending}
            onClick={() =>
              void save.run(item?.id ?? null, { ...f, code: f.code || null, description: f.description || null, defaultEstimatedPrice: f.defaultEstimatedPrice || null })
            }
          >
            {save.pending && <Loader2 className="size-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
