"use client";

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldHint } from "@/components/app/form-bits";
import { SearchSelect, type SearchOption } from "@/components/app/search-select";
import { SecretReveal } from "@/components/app/secret-reveal";
import { useAction } from "@/components/app/use-action";
import { createUserAction, setAccountStatusAction } from "../actions";

export function ActivateButton({ userId }: { userId: string }) {
  const act = useAction(setAccountStatusAction);
  return (
    <Button size="sm" variant="outline" className="h-7" disabled={act.pending} onClick={() => void act.run(userId, "ACTIVE", null)}>
      {act.pending && <Loader2 className="size-3.5 animate-spin" />} Aktifkan
    </Button>
  );
}

const EMPTY = { username: "", fullName: "", email: "", employeeId: null as string | null, roleIds: [] as string[] };

export function NewUserDialog({ roles, employees }: { roles: SearchOption[]; employees: Array<SearchOption & { email: string | null }> }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [secret, setSecret] = useState<string | null>(null);
  const create = useAction(createUserAction, { success: null, onSuccess: (d) => setSecret(d.temporaryPassword) });
  const fe = create.fieldErrors;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setF(EMPTY);
          setSecret(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" /> Buat akun
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{secret ? "Akun dibuat" : "Buat akun"}</DialogTitle>
          <DialogDescription>
            {secret
              ? "Berikan password sementara ini kepada pengguna. Password hanya ditampilkan sekali dan wajib diganti saat login pertama."
              : "Akun langsung aktif. Pengguna wajib mengganti password sementara saat login pertama."}
          </DialogDescription>
        </DialogHeader>
        {secret ? (
          <SecretReveal value={secret} note={`Username: ${f.username}`} />
        ) : (
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Data pegawai</Label>
              <SearchSelect
                value={f.employeeId}
                options={employees}
                placeholder="Pilih pegawai (opsional)"
                onChange={(v) => {
                  const emp = employees.find((e) => e.value === v);
                  setF({ ...f, employeeId: v, fullName: emp && !f.fullName ? emp.label : f.fullName, email: emp?.email && !f.email ? emp.email : f.email });
                }}
              />
              <FieldHint error={fe.employeeId} hint="Menautkan akun ke bagian dan atasan pegawai — diperlukan untuk jalur persetujuan." />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nu-name">Nama lengkap *</Label>
                <Input id="nu-name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} aria-invalid={!!fe.fullName} />
                <FieldHint error={fe.fullName} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nu-username">Username *</Label>
                <Input id="nu-username" value={f.username} autoComplete="off" onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} aria-invalid={!!fe.username} />
                <FieldHint error={fe.username} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nu-email">Email *</Label>
              <Input id="nu-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-invalid={!!fe.email} />
              <FieldHint error={fe.email} />
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Peran</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {roles.map((r) => (
                  <label key={r.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={f.roleIds.includes(r.value)}
                      onCheckedChange={(c) => setF({ ...f, roleIds: c ? [...f.roleIds, r.value] : f.roleIds.filter((x) => x !== r.value) })}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
        <DialogFooter>
          {secret ? (
            <Button onClick={() => setOpen(false)}>Selesai</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button disabled={create.pending} onClick={() => void create.run(f)}>
                {create.pending && <Loader2 className="size-4 animate-spin" />} Buat akun
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
