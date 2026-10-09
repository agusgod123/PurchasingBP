"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldHint, FormMessage, SubmitButton } from "@/components/app/form-bits";
import { resetPasswordAction, type FormState } from "../actions";

export function ResetForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(resetPasswordAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold">Atur ulang password</h2>
        <p className="text-sm text-muted-foreground">Buat password baru untuk akun Anda.</p>
      </div>
      <FormMessage error={state.error} success={state.success} />
      {state.success ? (
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Masuk sekarang
        </Link>
      ) : (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-2">
            <Label htmlFor="password">Password baru</Label>
            <Input id="password" name="password" type="password" required autoComplete="new-password" className="h-10" />
            <FieldHint error={fe.password} hint="Min. 8 karakter, huruf & angka" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Ulangi password baru</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" className="h-10" />
            <FieldHint error={fe.confirmPassword} />
          </div>
          <SubmitButton className="h-10">Simpan password</SubmitButton>
        </form>
      )}
    </div>
  );
}
