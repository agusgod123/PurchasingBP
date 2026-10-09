"use client";

import { useState } from "react";
import { Ban, KeyRound, Loader2, LogOut, PauseCircle, Plus, ShieldCheck, Trash2 } from "lucide-react";
import type { AccountStatus, ScopeAccessLevel } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldHint } from "@/components/app/form-bits";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { SearchSelect, type SearchOption } from "@/components/app/search-select";
import { SecretReveal } from "@/components/app/secret-reveal";
import { useAction } from "@/components/app/use-action";
import {
  resetPasswordAction,
  revokeSessionsAction,
  setAccountStatusAction,
  setUserRolesAction,
  setUserScopesAction,
  updateUserProfileAction,
} from "../../actions";

export function AccountActions({ userId, status, self, sessions }: { userId: string; status: AccountStatus; self: boolean; sessions: number }) {
  const [secret, setSecret] = useState<string | null>(null);
  const setStatus = useAction(setAccountStatusAction);
  const reset = useAction(resetPasswordAction, { onSuccess: (d) => setSecret(d.temporaryPassword) });
  const revoke = useAction(revokeSessionsAction);
  return (
    <>
      {status !== "ACTIVE" && (
        <Button disabled={setStatus.pending} onClick={() => void setStatus.run(userId, "ACTIVE", null)}>
          <ShieldCheck className="size-4" /> {status === "PENDING_ACTIVATION" ? "Aktifkan" : "Aktifkan kembali"}
        </Button>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" disabled={reset.pending}>
            <KeyRound className="size-4" /> Reset password
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset password?</AlertDialogTitle>
            <AlertDialogDescription>Password sementara akan dibuat dan semua sesi pengguna ini dikeluarkan. Pengguna wajib menggantinya saat login.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void reset.run(userId)}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {sessions > 0 && (
        <Button variant="ghost" disabled={revoke.pending} onClick={() => void revoke.run(userId)}>
          <LogOut className="size-4" /> Keluarkan sesi ({sessions})
        </Button>
      )}
      {!self && status === "ACTIVE" && (
        <ReasonDialog
          trigger={
            <Button variant="ghost">
              <PauseCircle className="size-4" /> Tangguhkan
            </Button>
          }
          title="Tangguhkan akun"
          description="Pengguna tidak dapat login sampai diaktifkan kembali. Semua sesi dikeluarkan."
          confirmText="Tangguhkan"
          onConfirm={(reason) => setStatus.run(userId, "SUSPENDED", reason)}
        />
      )}
      {!self && status !== "DISABLED" && (
        <ReasonDialog
          trigger={
            <Button variant="ghost" className="text-destructive hover:text-destructive">
              <Ban className="size-4" /> Nonaktifkan
            </Button>
          }
          title="Nonaktifkan akun"
          description="Gunakan untuk pegawai yang keluar/mutasi. Riwayat transaksi tetap tersimpan."
          confirmText="Nonaktifkan"
          destructive
          onConfirm={(reason) => setStatus.run(userId, "DISABLED", reason)}
        />
      )}
      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Password sementara</DialogTitle>
            <DialogDescription>Berikan kepada pengguna melalui jalur yang aman. Hanya ditampilkan sekali.</DialogDescription>
          </DialogHeader>
          {secret && <SecretReveal value={secret} />}
          <DialogFooter>
            <Button onClick={() => setSecret(null)}>Selesai</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProfileForm({
  userId,
  initial,
  employees,
}: {
  userId: string;
  initial: { fullName: string; email: string; employeeId: string | null };
  employees: SearchOption[];
}) {
  const [f, setF] = useState(initial);
  const save = useAction(updateUserProfileAction);
  const fe = save.fieldErrors;
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="p-name">Nama lengkap</Label>
        <Input id="p-name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} aria-invalid={!!fe.fullName} />
        <FieldHint error={fe.fullName} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="p-email">Email</Label>
        <Input id="p-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-invalid={!!fe.email} />
        <FieldHint error={fe.email} />
      </div>
      <div className="space-y-1.5">
        <Label>Data pegawai</Label>
        <SearchSelect value={f.employeeId} options={employees} placeholder="Belum ditautkan" onChange={(v) => setF({ ...f, employeeId: v })} invalid={!!fe.employeeId} />
        <FieldHint error={fe.employeeId} />
      </div>
      <Button disabled={!dirty || save.pending} onClick={() => void save.run(userId, f)}>
        {save.pending && <Loader2 className="size-4 animate-spin" />} Simpan
      </Button>
    </div>
  );
}

export function RolesForm({ userId, initial, roles }: { userId: string; initial: string[]; roles: SearchOption[] }) {
  const [ids, setIds] = useState(initial);
  const save = useAction(setUserRolesAction);
  const dirty = [...ids].sort().join() !== [...initial].sort().join();
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {roles.map((r) => (
          <li key={r.value}>
            <label className="flex gap-2.5 text-sm">
              <Checkbox className="mt-0.5" checked={ids.includes(r.value)} onCheckedChange={(c) => setIds(c ? [...ids, r.value] : ids.filter((x) => x !== r.value))} />
              <span>
                <span className="font-medium">{r.label}</span>
                {r.hint && <span className="block text-[13px] text-muted-foreground">{r.hint}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Button disabled={!dirty || save.pending} onClick={() => void save.run(userId, ids)}>
        {save.pending && <Loader2 className="size-4 animate-spin" />} Simpan peran
      </Button>
    </div>
  );
}

const LEVELS: Record<ScopeAccessLevel, string> = { READ: "Lihat", MANAGE: "Kelola", APPROVE: "Setujui" };

export function ScopesForm({
  userId,
  initial,
  departments,
}: {
  userId: string;
  initial: Array<{ departmentId: string; accessLevel: ScopeAccessLevel }>;
  departments: SearchOption[];
}) {
  const [rows, setRows] = useState(initial);
  const save = useAction(setUserScopesAction);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada cakupan tambahan — pengguna hanya melihat data bagiannya sendiri.</p>}
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="flex gap-2">
            <Select value={r.departmentId} onValueChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, departmentId: v } : x)))}>
              <SelectTrigger className="min-w-0 flex-1" aria-label="Bagian">
                <SelectValue placeholder="Pilih bagian" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={r.accessLevel} onValueChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, accessLevel: v as ScopeAccessLevel } : x)))}>
              <SelectTrigger className="w-28" aria-label="Tingkat akses">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LEVELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" aria-label="Hapus" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setRows([...rows, { departmentId: departments[0]?.value ?? "", accessLevel: "READ" }])}>
          <Plus className="size-4" /> Tambah bagian
        </Button>
        <Button size="sm" disabled={!dirty || save.pending || rows.some((r) => !r.departmentId)} onClick={() => void save.run(userId, rows)}>
          {save.pending && <Loader2 className="size-4 animate-spin" />} Simpan cakupan
        </Button>
      </div>
    </div>
  );
}
