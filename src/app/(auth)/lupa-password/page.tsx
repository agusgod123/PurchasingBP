"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage, SubmitButton } from "@/components/app/form-bits";
import { forgotPasswordAction, type FormState } from "../actions";

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState<FormState, FormData>(forgotPasswordAction, {});
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold">Lupa password</h2>
        <p className="text-sm text-muted-foreground">Kami akan mengirim tautan untuk mengatur ulang password ke email terdaftar.</p>
      </div>
      <FormMessage success={state.success} />
      {!state.success && (
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" className="h-10" />
          </div>
          <SubmitButton className="h-10" pendingText="Mengirim…">
            Kirim tautan
          </SubmitButton>
        </form>
      )}
      <p className="text-sm text-muted-foreground">
        Tidak menerima email? Hubungi Admin untuk dibantu. ·{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Kembali masuk
        </Link>
      </p>
    </div>
  );
}
