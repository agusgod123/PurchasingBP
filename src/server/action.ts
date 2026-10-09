import "server-only";
import { after } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { AppError } from "@/server/errors";
import { flushOutbox } from "@/server/notifications/outbox";

export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Pembungkus Server Action: error domain ditampilkan apa adanya, error teknis
 * disembunyikan. Email/notifikasi dikirim setelah respons (tidak memperlambat UI).
 */
export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    after(async () => {
      await flushOutbox(20).catch((e) => console.error("[outbox]", e));
    });
    return { ok: true, data, message };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AppError) {
      return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    }
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
      return { ok: false, error: err.issues[0]?.message ?? "Data tidak valid.", fieldErrors };
    }
    console.error("[action]", err);
    return { ok: false, error: "Terjadi kesalahan sistem. Silakan coba lagi atau hubungi Admin." };
  }
}
