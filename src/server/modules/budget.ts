import type { DbOrTx } from "@/server/db";
import { dec, sum, type Decimal } from "@/server/money";
import { yearInTz, zonedMidnight } from "@/server/time";
import type { RequestStatus } from "@/generated/prisma/enums";

/** Status pengajuan yang dihitung sebagai pemakaian/komitmen anggaran. */
const COMMITTED: RequestStatus[] = [
  "PENDING_APPROVAL",
  "ON_HOLD",
  "APPROVED",
  "IN_PROCUREMENT",
  "READY_FOR_HANDOVER",
  "AWAITING_CONFIRMATION",
  "COMPLETED",
  "CANCELLATION_REQUESTED",
];

export interface BudgetStatus {
  fiscalYear: number;
  budget: Decimal | null;
  committed: Decimal;
  remaining: Decimal | null;
  /** true jika (komitmen + nilai tambahan) melampaui anggaran */
  exceeded: boolean;
}

/**
 * Perkiraan pemakaian anggaran bagian = jumlah estimasi pengajuan aktif/selesai
 * pada tahun berjalan. Hanya untuk PERINGATAN — tidak memblokir transaksi (FR-PUR-11).
 */
export async function budgetStatus(
  db: DbOrTx,
  departmentId: string,
  additional: Decimal | number = 0,
  options: { excludeRequestId?: string; date?: Date } = {},
): Promise<BudgetStatus> {
  const fiscalYear = yearInTz(options.date ?? new Date());
  const budget = await db.departmentBudget.findUnique({ where: { departmentId_fiscalYear: { departmentId, fiscalYear } } });
  const start = zonedMidnight(`${fiscalYear}-01-01`);
  const end = zonedMidnight(`${fiscalYear + 1}-01-01`);
  const rows = await db.request.findMany({
    where: {
      departmentId,
      status: { in: COMMITTED },
      submittedAt: { gte: start, lt: end },
      ...(options.excludeRequestId ? { id: { not: options.excludeRequestId } } : {}),
    },
    select: { estimatedTotal: true },
  });
  const committed = sum(rows.map((r) => r.estimatedTotal));
  if (!budget) return { fiscalYear, budget: null, committed, remaining: null, exceeded: false };
  const remaining = dec(budget.amount).minus(committed);
  return {
    fiscalYear,
    budget: dec(budget.amount),
    committed,
    remaining,
    exceeded: committed.plus(dec(additional)).gt(budget.amount),
  };
}
