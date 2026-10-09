"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldHint, FormMessage, SubmitButton } from "@/components/app/form-bits";
import { registerAction, type FormState } from "../actions";

export function RegisterForm({ departments }: { departments: Array<{ id: string; name: string; code: string }> }) {
  const [state, formAction] = useActionState<FormState, FormData>(registerAction, {});
  const fe = state.fieldErrors ?? {};
  const v = state.values ?? {};

  if (state.success) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Pendaftaran terkirim</h2>
        <FormMessage success={state.success} />
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Kembali ke halaman masuk
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold">Daftar akun</h2>
        <p className="text-sm text-muted-foreground">Akun aktif setelah diverifikasi Admin.</p>
      </div>
      <form action={formAction} className="space-y-4" noValidate>
        <FormMessage error={state.error} />
        <div className="space-y-2">
          <Label htmlFor="fullName">Nama lengkap</Label>
          <Input id="fullName" name="fullName" required defaultValue={v.fullName} aria-invalid={!!fe.fullName} />
          <FieldHint error={fe.fullName} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" name="username" required autoComplete="username" defaultValue={v.username} aria-invalid={!!fe.username} />
            <FieldHint error={fe.username} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="employeeNumber">No. pegawai (opsional)</Label>
            <Input id="employeeNumber" name="employeeNumber" defaultValue={v.employeeNumber} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email kantor</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" defaultValue={v.email} aria-invalid={!!fe.email} />
          <FieldHint error={fe.email} />
        </div>
        <div className="space-y-2">
          <Label>Bagian</Label>
          <Select name="departmentId" defaultValue={v.departmentId}>
            <SelectTrigger className="w-full" aria-invalid={!!fe.departmentId}>
              <SelectValue placeholder="Pilih bagian" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldHint error={fe.departmentId} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="positionName">Jabatan (opsional)</Label>
          <Input id="positionName" name="positionName" defaultValue={v.positionName} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="new-password" aria-invalid={!!fe.password} />
            <FieldHint error={fe.password} hint="Min. 8 karakter, huruf & angka" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Ulangi password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" aria-invalid={!!fe.confirmPassword} />
            <FieldHint error={fe.confirmPassword} />
          </div>
        </div>
        <SubmitButton className="h-10" pendingText="Mendaftar…">
          Daftar
        </SubmitButton>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Masuk
        </Link>
      </p>
    </div>
  );
}
