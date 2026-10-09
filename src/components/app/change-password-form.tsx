"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldHint, FormMessage, SubmitButton } from "@/components/app/form-bits";
import { changePasswordAction, type FormState } from "@/app/(auth)/actions";

export function ChangePasswordForm({ redirectAfter = false }: { redirectAfter?: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(changePasswordAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4">
      {redirectAfter && <input type="hidden" name="redirect" value="1" />}
      <FormMessage error={state.error} success={state.success} />
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Password saat ini</Label>
        <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
        <FieldHint error={fe.currentPassword} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">Password baru</Label>
        <Input id="newPassword" name="newPassword" type="password" required autoComplete="new-password" />
        <FieldHint error={fe.newPassword} hint="Min. 8 karakter, huruf & angka" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Ulangi password baru</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" />
        <FieldHint error={fe.confirmPassword} />
      </div>
      <SubmitButton className={redirectAfter ? "h-10" : "w-auto"}>Simpan password</SubmitButton>
    </form>
  );
}
