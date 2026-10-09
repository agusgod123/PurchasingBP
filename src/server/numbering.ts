import type { DbOrTx } from "@/server/db";
import { yearInTz } from "@/server/time";

export const DOC_PREFIX = {
  REQUEST: "PB",
  PURCHASE_ORDER: "PO",
  RECEIPT: "GR",
  HANDOVER: "ST",
  TICKET: "TK",
} as const;

export type DocPrefix = (typeof DOC_PREFIX)[keyof typeof DOC_PREFIX];

/**
 * Nomor dokumen unik per jenis dan tahun, mis. PB-2026-00001.
 * Atomik (INSERT ... ON CONFLICT ... RETURNING) sehingga aman dari duplikasi.
 */
export async function nextNumber(db: DbOrTx, prefix: DocPrefix, date: Date = new Date()): Promise<string> {
  const year = yearInTz(date);
  const rows = await db.$queryRaw<Array<{ last_value: number }>>`
    INSERT INTO "number_sequences" ("doc_type", "year", "last_value")
    VALUES (${prefix}, ${year}, 1)
    ON CONFLICT ("doc_type", "year")
    DO UPDATE SET "last_value" = "number_sequences"."last_value" + 1
    RETURNING "last_value"`;
  const value = Number(rows[0]?.last_value ?? 0);
  return `${prefix}-${year}-${String(value).padStart(5, "0")}`;
}
