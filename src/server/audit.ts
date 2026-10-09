import type { DbOrTx } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

const SENSITIVE_KEYS = /password|token|secret|hash/i;

function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  const json = JSON.parse(
    JSON.stringify(value, (key, v) => (key && SENSITIVE_KEYS.test(key) ? "[disembunyikan]" : v)),
  );
  return json as Prisma.InputJsonValue;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  reason?: string | null;
}

/** Pelaku audit: ActorContext atau cukup id pengguna (mis. saat login/registrasi). */
export type AuditActor = { user: { id: string }; ip?: string | null; userAgent?: string | null } | null;

/** Mencatat aktivitas penting. Panggil di dalam transaksi yang sama dengan perubahan datanya. */
export async function audit(db: DbOrTx, ctx: AuditActor, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: ctx?.user.id ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      oldValues: sanitize(entry.oldValues),
      newValues: sanitize(entry.newValues),
      reason: entry.reason ?? null,
      ipAddress: ctx?.ip?.slice(0, 64) ?? null,
      userAgent: ctx?.userAgent?.slice(0, 512) ?? null,
    },
  });
}
