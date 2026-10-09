"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage, SubmitButton } from "@/components/app/form-bits";
import { loginAction, type FormState } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold">Masuk</h2>
        <p className="text-sm text-muted-foreground">Gunakan username atau email kantor Anda.</p>
      </div>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <FormMessage error={state.error} />
        <div className="space-y-2">
          <Label htmlFor="identifier">Username atau email</Label>
          <Input
            id="identifier"
            name="identifier"
            autoComplete="username"
            autoFocus
            required
            defaultValue={state.values?.identifier}
            className="h-10"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/lupa-password" className="text-[13px] text-primary hover:underline">
              Lupa password?
            </Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10" />
        </div>
        <SubmitButton className="h-10" pendingText="Masuk…">
          Masuk
        </SubmitButton>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Belum punya akun?{" "}
        <Link href="/daftar" className="font-medium text-primary hover:underline">
          Daftar
        </Link>
      </p>
    </div>
  );
}
