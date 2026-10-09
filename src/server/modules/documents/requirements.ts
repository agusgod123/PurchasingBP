import type { DbOrTx } from "@/server/db";
import type { DocumentStage, DocumentType } from "@/generated/prisma/enums";
import { dec, type DecimalInput } from "@/server/money";
import { DOCUMENT_TYPE } from "@/lib/status";

export interface RequirementCheck {
  documentType: DocumentType;
  required: number;
  present: number;
  satisfied: boolean;
  message: string;
  description: string | null;
}

interface Target {
  requestId?: string;
  purchaseOrderId?: string;
  handoverId?: string;
  goodsReceiptIds?: string[];
  amount?: DecimalInput;
}

async function countDocuments(db: DbOrTx, stage: DocumentStage, type: DocumentType, t: Target): Promise<number> {
  const base = { documentType: type, uploadStatus: "READY" as const, deletedAt: null };
  switch (stage) {
    case "REQUEST_SUBMIT":
      return db.document.count({ where: { ...base, requestId: t.requestId } });
    case "PO_ORDER":
    case "PO_CLOSE":
      if (type === "VENDOR_QUOTE") {
        // Dihitung per penawaran yang memiliki berkas.
        return db.vendorQuote.count({
          where: { purchaseOrderId: t.purchaseOrderId, documents: { some: { uploadStatus: "READY", deletedAt: null } } },
        });
      }
      return db.document.count({ where: { ...base, purchaseOrderId: t.purchaseOrderId } });
    case "RECEIPT":
      // Setiap penerimaan harus memenuhi jumlah minimum; kembalikan jumlah terkecil.
      if (!t.goodsReceiptIds?.length) return 0;
      {
        let min = Number.POSITIVE_INFINITY;
        for (const id of t.goodsReceiptIds) {
          min = Math.min(min, await db.document.count({ where: { ...base, goodsReceiptId: id } }));
        }
        return min;
      }
    case "HANDOVER_CONFIRM":
      return db.document.count({ where: { ...base, handoverId: t.handoverId } });
  }
}

/** Memeriksa dokumen wajib untuk suatu tahap (dikonfigurasi Admin di document_requirements). */
export async function checkDocumentRequirements(
  db: DbOrTx,
  stage: DocumentStage,
  target: Target,
): Promise<RequirementCheck[]> {
  const reqs = await db.documentRequirement.findMany({ where: { stage, isActive: true }, orderBy: { createdAt: "asc" } });
  const amount = dec(target.amount ?? 0);
  const result: RequirementCheck[] = [];
  for (const r of reqs) {
    if (r.minAmount !== null && amount.lt(r.minAmount)) continue;
    if (stage === "RECEIPT" && !target.goodsReceiptIds?.length) continue;
    const present = await countDocuments(db, stage, r.documentType, target);
    const label = DOCUMENT_TYPE[r.documentType];
    result.push({
      documentType: r.documentType,
      required: r.minCount,
      present,
      satisfied: present >= r.minCount,
      message:
        present >= r.minCount
          ? `${label}: lengkap (${present}/${r.minCount})`
          : `${label}: minimal ${r.minCount}, baru ${present}`,
      description: r.description,
    });
  }
  return result;
}

export function unmetMessages(checks: RequirementCheck[]): string[] {
  return checks.filter((c) => !c.satisfied).map((c) => c.message);
}
