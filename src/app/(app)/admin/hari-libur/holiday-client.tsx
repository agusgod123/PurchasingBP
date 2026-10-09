"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldHint } from "@/components/app/form-bits";
import { useAction } from "@/components/app/use-action";
import { addHolidayAction, deleteHolidayAction } from "../actions";

export function AddHolidayForm({ defaultYear }: { defaultYear: number }) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const add = useAction(addHolidayAction, {
    onSuccess: () => {
      setDate("");
      setName("");
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void add.run({ date, name });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="h-date">Tanggal</Label>
        <Input id="h-date" type="date" value={date} min={`${defaultYear - 1}-01-01`} onChange={(e) => setDate(e.target.value)} aria-invalid={!!add.fieldErrors.date} required />
        <FieldHint error={add.fieldErrors.date} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="h-name">Keterangan</Label>
        <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Hari Kemerdekaan RI" aria-invalid={!!add.fieldErrors.name} required />
        <FieldHint error={add.fieldErrors.name} />
      </div>
      <Button type="submit" className="w-full" disabled={add.pending}>
        {add.pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Tambah
      </Button>
    </form>
  );
}

export function DeleteHolidayButton({ id, label }: { id: string; label: string }) {
  const del = useAction(deleteHolidayAction);
  return (
    <Button variant="ghost" size="icon" aria-label={`Hapus ${label}`} disabled={del.pending} onClick={() => confirm(`Hapus "${label}"?`) && void del.run(id)}>
      <Trash2 className="size-4" />
    </Button>
  );
}
