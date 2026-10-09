"use server";

import { redirect } from "next/navigation";
import { login, register, requestPasswordReset, resetPassword, changePassword, type RegisterInput } from "@/server/modules/auth/service";
import { clearSessionCookie, getActor, getSession, requestMeta, setSessionCookie } from "@/server/auth/current";
import { invalidateSession } from "@/server/auth/session";
import { env } from "@/server/env";
import { runAction } from "@/server/action";
import { flushOutbox } from "@/server/notifications/outbox";
import { after } from "next/server";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  values?: Record<string, string>;
}

function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/login") ? value : "/dashboard";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");
  const meta = await requestMeta();
  const res = await login(identifier, password, { ip: meta.ip, userAgent: meta.userAgent });
  if (!res.ok) return { error: res.message, values: { identifier } };
  await setSessionCookie(res.token);
  redirect(res.mustChangePassword ? "/ganti-password" : safeNext(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) await invalidateSession(session.sessionId);
  await clearSessionCookie();
  redirect("/login");
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)])) as Record<string, string>;
  const meta = await requestMeta();
  const res = await runAction(() => register(values as unknown as RegisterInput, meta));
  if (!res.ok) {
    delete values.password;
    delete values.confirmPassword;
    return { error: res.error, fieldErrors: res.fieldErrors, values };
  }
  return {
    success: "Pendaftaran berhasil. Akun Anda akan aktif setelah diverifikasi Admin; Anda akan menerima email pemberitahuan.",
  };
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  await requestPasswordReset(email, env().APP_URL).catch((e) => console.error("[reset]", e));
  after(() => flushOutbox(5).catch(() => undefined));
  return {
    success: "Jika email terdaftar dan akun aktif, tautan untuk mengatur ulang password telah dikirim. Periksa kotak masuk Anda.",
  };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (password !== confirm) return { fieldErrors: { confirmPassword: "Konfirmasi password tidak sama" }, error: "Konfirmasi password tidak sama." };
  const res = await runAction(() => resetPassword(token, password));
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors };
  return { success: "Password berhasil diubah. Silakan masuk dengan password baru." };
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (next !== confirm) return { fieldErrors: { confirmPassword: "Konfirmasi password tidak sama" }, error: "Konfirmasi password tidak sama." };
  const session = await getSession();
  const res = await runAction(async () => {
    const ctx = await getActor();
    await changePassword(ctx, current, next, session?.sessionId);
  });
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors };
  if (formData.get("redirect") === "1") redirect("/dashboard");
  return { success: "Password berhasil diubah." };
}
