import "server-only";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/user";
import { can } from "@/server/auth/user";
import { PERMISSIONS } from "@/lib/permissions";
import { deriveStage, REQUEST_STATUS, STAGES } from "@/lib/status";
import type { PurchaseOrderStatus, RequestStatus } from "@/generated/prisma/enums";
import { decNum, sum } from "@/server/money";
import { todayDateOnly, yearInTz, zonedMidnight, dateKeyInTz } from "@/server/time";
import { queueRequestCount } from "@/server/queries/tasks";
import { budgetStatus } from "@/server/modules/budget";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export async function dashboardData(user: AuthUser) {
  const canCreate = can(user, PERMISSIONS.REQUEST_CREATE);
  const purchasing = can(user, PERMISSIONS.PURCHASING_MANAGE);
  const reportAll = can(user, PERMISSIONS.REPORT_VIEW_ALL);
  const reportDept = can(user, PERMISSIONS.REPORT_VIEW_DEPARTMENT);
  const today = todayDateOnly();
  const now = new Date();

  // --- Pemohon -------------------------------------------------------------
  const mine = canCreate
    ? await db.request.findMany({
        where: { requesterId: user.id, status: { notIn: ["CANCELLED"] } },
        include: { purchaseOrderLinks: { select: { purchaseOrder: { select: { status: true } } } } },
        orderBy: { updatedAt: "desc" },
      })
    : [];
  const stageCounts = Object.fromEntries(STAGES.map((s) => [s.key, 0])) as Record<string, number>;
  for (const r of mine) {
    const poStatuses = r.purchaseOrderLinks.map((l) => l.purchaseOrder.status).filter((s) => s !== "CANCELLED") as PurchaseOrderStatus[];
    stageCounts[deriveStage(r.status, poStatuses)]++;
  }
  const activeMine = mine
    .filter((r) => !["COMPLETED", "CANCELLED"].includes(r.status))
    .slice(0, 6)
    .map((r) => ({
      id: r.id,
      requestNumber: r.requestNumber,
      title: r.title,
      status: r.status,
      stage: deriveStage(r.status, r.purchaseOrderLinks.map((l) => l.purchaseOrder.status).filter((s) => s !== "CANCELLED") as PurchaseOrderStatus[]),
      updatedAt: r.updatedAt,
    }));

  // --- Approver -------------------------------------------------------------
  const [pendingApprovals, overdueApprovals] = await Promise.all([
    db.approvalAssignment.count({ where: { approverUserId: user.id, status: "PENDING" } }),
    db.approvalAssignment.count({ where: { approverUserId: user.id, status: "PENDING", dueAt: { lt: now } } }),
  ]);

  // --- Purchasing -------------------------------------------------------------
  let purchasingStats: null | {
    queue: number;
    preparing: number;
    shipping: number;
    late: number;
    onHold: number;
    readyHandover: number;
    latePos: Array<{ id: string; poNumber: string; vendor: string | null; currentEta: Date | null; daysLate: number }>;
  } = null;
  if (purchasing) {
    const [queue, groups, latePos, readyHandover] = await Promise.all([
      queueRequestCount(),
      db.purchaseOrder.groupBy({ by: ["status"], _count: true }),
      db.purchaseOrder.findMany({
        where: { status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] }, currentEta: { lt: today } },
        include: { vendor: { select: { name: true } } },
        orderBy: { currentEta: "asc" },
        take: 5,
      }),
      db.request.count({ where: { status: "READY_FOR_HANDOVER" } }),
    ]);
    const c = (s: PurchaseOrderStatus[]) => groups.filter((g) => s.includes(g.status)).reduce((a, g) => a + g._count, 0);
    purchasingStats = {
      queue,
      preparing: c(["DRAFT", "PENDING_CHANGE_APPROVAL", "READY_TO_ORDER"]),
      shipping: c(["ORDERED", "PARTIALLY_RECEIVED"]),
      late: await db.purchaseOrder.count({ where: { status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] }, currentEta: { lt: today } } }),
      onHold: c(["ON_HOLD"]),
      readyHandover,
      latePos: latePos.map((p) => ({
        id: p.id,
        poNumber: p.poNumber,
        vendor: p.vendor?.name ?? null,
        currentEta: p.currentEta,
        daysLate: p.currentEta ? Math.round((today.getTime() - p.currentEta.getTime()) / 86_400_000) : 0,
      })),
    };
  }

  // --- Pimpinan / laporan -------------------------------------------------
  let overview: null | {
    scopeLabel: string;
    byStatus: Array<{ label: string; value: number; href: string }>;
    trend: Array<{ label: string; value: number; hint: string }>;
    approvedValueYear: number;
    activeCount: number;
    completedThisMonth: number;
    critical: Array<{ id: string; href: string; title: string; detail: string }>;
    budgets: Array<{ label: string; used: number; budget: number }>;
  } = null;
  if (reportAll || reportDept) {
    const deptIds = reportAll ? null : [...new Set([user.departmentId, ...user.scopes.map((s) => s.departmentId)].filter(Boolean) as string[])];
    const scope = deptIds ? { departmentId: { in: deptIds } } : {};
    const year = yearInTz();
    const yearStart = zonedMidnight(`${year}-01-01`);
    const monthKey = dateKeyInTz().slice(0, 7);
    const monthStart = zonedMidnight(`${monthKey}-01`);

    const statusGroups = await db.request.groupBy({ by: ["status"], where: { ...scope, status: { not: "DRAFT" } }, _count: true });
    const order: RequestStatus[] = [
      "PENDING_APPROVAL",
      "REVISION_REQUIRED",
      "ON_HOLD",
      "APPROVED",
      "IN_PROCUREMENT",
      "READY_FOR_HANDOVER",
      "AWAITING_CONFIRMATION",
      "COMPLETED",
      "CANCELLATION_REQUESTED",
      "CANCELLED",
    ];
    const byStatus = order
      .map((s) => ({ label: REQUEST_STATUS[s].label, value: statusGroups.find((g) => g.status === s)?._count ?? 0, href: `/pengajuan/semua?status=${s}` }))
      .filter((d) => d.value > 0);

    // Tren 6 bulan terakhir (berdasarkan tanggal diajukan).
    const trend: Array<{ label: string; value: number; hint: string }> = [];
    const [cy, cm] = monthKey.split("-").map(Number);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(cy, cm - 1 - i, 1));
      const key = d.toISOString().slice(0, 7);
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
      const count = await db.request.count({
        where: { ...scope, submittedAt: { gte: zonedMidnight(`${key}-01`), lt: zonedMidnight(`${next}-01`) } },
      });
      trend.push({ label: MONTHS[d.getUTCMonth()], value: count, hint: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` });
    }

    const [approvedRows, activeCount, completedThisMonth, overdueReq, latePo] = await Promise.all([
      db.request.findMany({
        where: { ...scope, approvedAt: { gte: yearStart }, status: { notIn: ["CANCELLED"] } },
        select: { estimatedTotal: true },
      }),
      db.request.count({ where: { ...scope, status: { in: ["PENDING_APPROVAL", "ON_HOLD", "APPROVED", "IN_PROCUREMENT", "READY_FOR_HANDOVER", "AWAITING_CONFIRMATION"] } } }),
      db.request.count({ where: { ...scope, completedAt: { gte: monthStart } } }),
      db.request.findMany({
        where: { ...scope, neededDate: { lt: today }, status: { notIn: ["DRAFT", "COMPLETED", "CANCELLED"] } },
        select: { id: true, requestNumber: true, title: true, neededDate: true, status: true },
        orderBy: { neededDate: "asc" },
        take: 5,
      }),
      db.purchaseOrder.findMany({
        where: {
          status: { in: ["ORDERED", "PARTIALLY_RECEIVED", "ON_HOLD"] },
          currentEta: { lt: new Date(today.getTime() - 3 * 86_400_000) },
          ...(deptIds ? { requestLinks: { some: { request: { departmentId: { in: deptIds } } } } } : {}),
        },
        include: { vendor: { select: { name: true } } },
        orderBy: { currentEta: "asc" },
        take: 5,
      }),
    ]);

    const departments = await db.department.findMany({ where: { isActive: true, ...(deptIds ? { id: { in: deptIds } } : {}) }, orderBy: { name: "asc" } });
    const budgets: Array<{ label: string; used: number; budget: number }> = [];
    for (const d of departments) {
      const b = await budgetStatus(db, d.id);
      if (b.budget) budgets.push({ label: d.name, used: decNum(b.committed), budget: decNum(b.budget) });
    }

    overview = {
      scopeLabel: reportAll ? "Seluruh bagian" : "Bagian Anda",
      byStatus,
      trend,
      approvedValueYear: decNum(sum(approvedRows.map((r) => r.estimatedTotal))),
      activeCount,
      completedThisMonth,
      critical: [
        ...latePo.map((p) => ({
          id: p.id,
          href: purchasing ? `/purchasing/po/${p.id}` : "/laporan?report=keterlambatan",
          title: `${p.poNumber} terlambat ${p.currentEta ? Math.round((today.getTime() - p.currentEta.getTime()) / 86_400_000) : 0} hari`,
          detail: `${p.vendor?.name ?? "-"}${p.status === "ON_HOLD" ? " · ditahan karena masalah barang" : ""}`,
        })),
        ...overdueReq.map((r) => ({
          id: r.id,
          href: `/pengajuan/${r.id}`,
          title: `${r.requestNumber} melewati tanggal dibutuhkan`,
          detail: `${r.title} · ${REQUEST_STATUS[r.status].label}`,
        })),
      ].slice(0, 6),
      budgets,
    };
  }

  // --- Admin ---------------------------------------------------------------
  const admin =
    can(user, PERMISSIONS.USER_MANAGE) || can(user, PERMISSIONS.APPROVAL_RULE_MANAGE)
      ? {
          pendingUsers: await db.user.count({ where: { accountStatus: "PENDING_ACTIVATION" } }),
          onHold: await db.request.count({ where: { status: "ON_HOLD" } }),
          failedEmails: await db.emailOutbox.count({ where: { status: "FAILED" } }),
          activeRules: await db.approvalRule.count({ where: { isActive: true, subjectType: "REQUEST" } }),
        }
      : null;

  return { canCreate, mineCount: mine.length, stageCounts, activeMine, pendingApprovals, overdueApprovals, purchasingStats, overview, admin };
}
