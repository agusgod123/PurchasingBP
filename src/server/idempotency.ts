import { db, type Tx } from "@/server/db";
import { ConflictError } from "@/server/errors";
import { Prisma } from "@/generated/prisma/client";

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

/**
 * Menjalankan operasi dalam transaksi. Jika `key` diisi, pengiriman ulang dengan
 * key yang sama (mis. klik ganda / retry jaringan) mengembalikan hasil pertama
 * tanpa membuat transaksi ganda.
 */
export async function withIdempotency<T>(
  userId: string,
  key: string | null | undefined,
  action: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!key) return db.$transaction(fn, TX_OPTIONS);
  const fullKey = `${userId}:${action}:${key}`.slice(0, 200);

  const existing = await db.idempotencyKey.findUnique({ where: { key: fullKey } });
  if (existing) return replay<T>(existing.resultJson);

  try {
    return await db.$transaction(async (tx) => {
      await tx.idempotencyKey.create({ data: { key: fullKey, userId, action } });
      const result = await fn(tx);
      await tx.idempotencyKey.update({
        where: { key: fullKey },
        data: { resultJson: (result ?? null) as Prisma.InputJsonValue },
      });
      return result;
    }, TX_OPTIONS);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const row = await db.idempotencyKey.findUnique({ where: { key: fullKey } });
      if (row) return replay<T>(row.resultJson);
    }
    throw err;
  }
}

function replay<T>(json: unknown): T {
  if (json === null || json === undefined) {
    throw new ConflictError("Permintaan yang sama sedang diproses. Tunggu sebentar lalu muat ulang halaman.");
  }
  return json as T;
}

export function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(fn, TX_OPTIONS);
}
