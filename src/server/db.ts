import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // Serverless (Vercel/Netlify) membuka banyak instance; batasi koneksi per instance.
    // Minimal 2: beberapa pembacaan (mis. pengaturan ber-cache) berjalan di luar transaksi aktif.
    max: Math.max(2, Number(process.env.DATABASE_POOL_MAX ?? (process.env.VERCEL || process.env.NETLIFY ? 3 : 10))),
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Db = typeof db;
/** Klien transaksi interaktif (`db.$transaction(async (tx) => ...)`). */
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
/** Bisa klien utama atau klien transaksi. */
export type DbOrTx = Db | Tx;
