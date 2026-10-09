import "server-only";
import type { Priority, PurchaseOrderStatus, RequestStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/user";
import { NotFoundError } from "@/server/errors";
import { decNum } from "@/server/money";
import { loadWorkCalendar } from "@/server/calendar";
import { budgetStatus } from "@/server/modules/budget";
import { dateKeyInTz, todayDateOnly, workingHoursBetween, zonedMidnight } from "@/server/time";
import { PERMISSIONS } from "@/lib/permissions";
import type { ReportResult, ReportRow } from "@/lib/reports";
import {
  APPROVAL_SUBJECT,
  DISCREPANCY_STATUS,
  DISCREPANCY_TYPE,
  FOLLOWUP_TYPE,
  PO_STATUS,
  PRIORITY,
  REQUEST_STATUS,
  RESOLUTION_TYPE,
} from "@/lib/status";
import {
  bucketLabel,
  bucketList,
  bucketOf,
  dateRange,
  effectiveDepartments,
  GROUP_LABEL,
  purchaseOrderWhere,
  reportScope,
  requestWhere,
  type ReportFilters,
} from "./filters";

/** Batas baris untuk ekspor; halaman menampilkan sebagian dan menyarankan ekspor. */
const MAX_ROWS = 10_000;
const DAY = 86_400_000;

const OPEN_STATUSES: RequestStatus[] = [
  "PENDING_APPROVAL",
  "REVISION_REQUIRED",
  "ON_HOLD",
  "APPROVED",
  "IN_PROCUREMENT",
  "READY_FOR_HANDOVER",
  "AWAITING_CONFIRMATION",
  "CANCELLATION_REQUESTED",
];
const OPEN_PO: PurchaseOrderStatus[] = ["ORDERED", "PARTIALLY_RECEIVED", "ON_HOLD"];

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const dateKey = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const days = (a: Date, b: Date) => (b.getTime() - a.getTime()) / DAY;
const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const effectivePriority = (r: { finalPriority: Priority | null; requestedPriority: Priority }) => r.finalPriority ?? r.requestedPriority;
const PRIORITY_ORDER: Priority[] = ["URGENT", "HIGH", "NORMAL", "LOW"];

interface Ctx {
  user: AuthUser;
  f: ReportFilters;
  depts: string[] | null;
}

// --- 1. Ringkasan status ----------------------------------------------------
async function statusReport({ f, depts }: Ctx): Promise<ReportResult> {
  const rows = await db.request.findMany({
    where: requestWhere(f, depts, "submittedAt"),
    select: { status: true, estimatedTotal: true, submittedAt: true },
    take: MAX_ROWS,
  });
  const total = rows.length;
  const byStatus = new Map<RequestStatus, { count: number; value: number }>();
  const buckets = new Map(bucketList(f).map((b) => [b, 0]));
  for (const r of rows) {
    const s = byStatus.get(r.status) ?? { count: 0, value: 0 };
    s.count++;
    s.value += decNum(r.estimatedTotal);
    byStatus.set(r.status, s);
    if (r.submittedAt) {
      const b = bucketOf(r.submittedAt, f.groupBy);
      buckets.set(b, (buckets.get(b) ?? 0) + 1);
    }
  }
  const order = (Object.keys(REQUEST_STATUS) as RequestStatus[]).filter((s) => s !== "DRAFT");
  return {
    summary: [
      { label: "Pengajuan masuk", value: total, type: "number" },
      { label: "Nilai estimasi", value: rows.reduce((a, r) => a + decNum(r.estimatedTotal), 0), type: "money" },
      { label: "Masih berjalan", value: rows.filter((r) => OPEN_STATUSES.includes(r.status)).length, type: "number" },
      { label: "Selesai", value: byStatus.get("COMPLETED")?.count ?? 0, type: "number" },
    ],
    chart: {
      title: `Pengajuan masuk per ${GROUP_LABEL[f.groupBy]}`,
      kind: "column",
      type: "number",
      data: [...buckets.entries()].map(([k, v]) => ({ ...bucketLabel(k, f.groupBy), value: v })),
    },
    columns: [
      { key: "status", label: "Status" },
      { key: "count", label: "Jumlah", type: "number" },
      { key: "share", label: "Porsi", type: "percent" },
      { key: "value", label: "Nilai estimasi", type: "money" },
    ],
    rows: order
      .filter((s) => byStatus.has(s))
      .map((s) => ({
        status: REQUEST_STATUS[s].label,
        count: byStatus.get(s)!.count,
        share: total ? (byStatus.get(s)!.count / total) * 100 : 0,
        value: byStatus.get(s)!.value,
      })),
    note: "Berdasarkan tanggal pengajuan dikirim. Status adalah posisi saat ini.",
  };
}

// --- 2. Pengajuan tertunda --------------------------------------------------
async function pendingReport({ f, depts }: Ctx): Promise<ReportResult> {
  const where = requestWhere(f, depts, undefined, { ignoreStatus: true });
  const statuses = f.status && OPEN_STATUSES.includes(f.status) ? [f.status] : OPEN_STATUSES;
  const rows = await db.request.findMany({
    where: { AND: [where, { status: { in: statuses } }] },
    orderBy: { submittedAt: "asc" },
    take: MAX_ROWS,
    include: {
      requester: { select: { fullName: true } },
      department: { select: { name: true } },
      approvalInstances: {
        where: { status: "IN_PROGRESS" },
        include: {
          steps: {
            where: { status: "PENDING" },
            include: { assignments: { where: { status: "PENDING" }, include: { approver: { select: { fullName: true } } } } },
          },
        },
      },
      purchaseOrderLinks: { include: { purchaseOrder: { select: { poNumber: true, status: true, currentEta: true } } } },
    },
  });
  const now = new Date();
  const today = todayDateOnly();
  const out: ReportRow[] = rows.map((r) => {
    const waiting = r.approvalInstances.flatMap((i) => i.steps.flatMap((s) => s.assignments.map((a) => a.approver.fullName)));
    const pos = r.purchaseOrderLinks.map((l) => l.purchaseOrder).filter((p) => p.status !== "CANCELLED");
    let position = REQUEST_STATUS[r.status].label;
    if (waiting.length) position = `Menunggu: ${[...new Set(waiting)].join(", ")}`;
    else if (pos.length) position = pos.map((p) => `${p.poNumber} ${PO_STATUS[p.status].label}${p.currentEta ? ` (ETA ${dateKey(p.currentEta)})` : ""}`).join("; ");
    else if (r.status === "ON_HOLD" && r.holdReason) position = `Ditahan: ${r.holdReason}`;
    const late = r.neededDate < today ? Math.floor(days(r.neededDate, today)) : null;
    return {
      _href: `/pengajuan/${r.id}`,
      number: r.requestNumber,
      title: r.title,
      department: r.department.name,
      requester: r.requester.fullName,
      status: REQUEST_STATUS[r.status].label,
      priority: PRIORITY[effectivePriority(r)].label,
      submittedAt: iso(r.submittedAt),
      age: r.submittedAt ? Math.floor(days(r.submittedAt, now)) : null,
      neededDate: dateKey(r.neededDate),
      late,
      position,
    };
  });
  const byStatus = new Map<string, number>();
  for (const r of rows) byStatus.set(REQUEST_STATUS[r.status].label, (byStatus.get(REQUEST_STATUS[r.status].label) ?? 0) + 1);
  const ages = out.map((r) => r.age).filter((x): x is number => typeof x === "number");
  return {
    summary: [
      { label: "Tertunda", value: rows.length, type: "number" },
      { label: "Lewat tanggal dibutuhkan", value: out.filter((r) => r.late !== null).length, type: "number" },
      { label: "Ditahan / perlu ditinjau", value: rows.filter((r) => r.status === "ON_HOLD").length, type: "number" },
      { label: "Rata-rata umur", value: avg(ages), type: "days" },
    ],
    chart: { title: "Tertunda per status", kind: "bar", type: "number", data: [...byStatus.entries()].map(([label, value]) => ({ label, value })) },
    columns: [
      { key: "number", label: "No. pengajuan" },
      { key: "title", label: "Judul" },
      { key: "department", label: "Bagian" },
      { key: "requester", label: "Pemohon" },
      { key: "status", label: "Status" },
      { key: "priority", label: "Prioritas" },
      { key: "submittedAt", label: "Diajukan", type: "date" },
      { key: "age", label: "Umur", type: "days" },
      { key: "neededDate", label: "Dibutuhkan", type: "date" },
      { key: "late", label: "Terlambat", type: "days" },
      { key: "position", label: "Posisi sekarang" },
    ],
    rows: out,
    note: "Posisi saat ini, tidak dibatasi periode. Diurutkan dari yang paling lama diajukan.",
  };
}

// --- 3. Lama proses per tahap ----------------------------------------------
async function durationReport({ f, depts }: Ctx): Promise<ReportResult> {
  const [rows, cal] = await Promise.all([
    db.request.findMany({
      where: requestWhere(f, depts, "submittedAt"),
      take: MAX_ROWS,
      select: {
        submittedAt: true,
        approvedAt: true,
        completedAt: true,
        purchaseOrderLinks: {
          select: { purchaseOrder: { select: { status: true, orderedAt: true, receipts: { select: { receivedAt: true } } } } },
        },
      },
    }),
    loadWorkCalendar(),
  ]);
  const stages: Record<string, { label: string; cal: number[]; work: number[] }> = {
    approval: { label: "Persetujuan (dikirim → disetujui)", cal: [], work: [] },
    procurement: { label: "Pengadaan (disetujui → dipesan)", cal: [], work: [] },
    delivery: { label: "Pengiriman (dipesan → diterima)", cal: [], work: [] },
    handover: { label: "Serah terima (diterima → dikonfirmasi)", cal: [], work: [] },
    total: { label: "Total (dikirim → selesai)", cal: [], work: [] },
  };
  const add = (k: keyof typeof stages, a: Date | null | undefined, b: Date | null | undefined) => {
    if (!a || !b || b < a) return;
    stages[k].cal.push(days(a, b));
    stages[k].work.push(workingHoursBetween(a, b, cal));
  };
  for (const r of rows) {
    const pos = r.purchaseOrderLinks.map((l) => l.purchaseOrder).filter((p) => p.status !== "CANCELLED");
    const ordered = pos.map((p) => p.orderedAt).filter((d): d is Date => !!d);
    const firstOrdered = ordered.length ? new Date(Math.min(...ordered.map((d) => d.getTime()))) : null;
    const receipts = pos.flatMap((p) => p.receipts.map((g) => g.receivedAt));
    const fullyReceived = pos.length > 0 && pos.every((p) => ["RECEIVED", "CLOSED"].includes(p.status));
    const lastReceived = fullyReceived && receipts.length ? new Date(Math.max(...receipts.map((d) => d.getTime()))) : null;
    add("approval", r.submittedAt, r.approvedAt);
    add("procurement", r.approvedAt, firstOrdered);
    add("delivery", firstOrdered, lastReceived);
    add("handover", lastReceived, r.completedAt);
    add("total", r.submittedAt, r.completedAt);
  }
  const out = Object.values(stages).map((s) => ({
    stage: s.label,
    samples: s.cal.length,
    avgDays: avg(s.cal),
    medianDays: median(s.cal),
    avgHours: avg(s.work),
    medianHours: median(s.work),
    maxDays: s.cal.length ? Math.max(...s.cal) : null,
  }));
  return {
    summary: [
      { label: "Pengajuan dianalisis", value: rows.length, type: "number" },
      { label: "Selesai (sampel total)", value: stages.total.cal.length, type: "number" },
      { label: "Median total (kalender)", value: median(stages.total.cal), type: "days" },
      { label: "Median total (jam kerja)", value: median(stages.total.work), type: "hours" },
    ],
    chart: {
      title: "Median durasi kalender per tahap",
      kind: "bar",
      type: "days",
      data: out
        .filter((s) => !s.stage.startsWith("Total"))
        .map((s) => ({
          label: s.stage.split(" (")[0],
          value: round1(s.medianDays ?? 0),
          hint: `${s.samples} sampel · median ${round1(s.medianHours ?? 0)} jam kerja`,
        })),
    },
    columns: [
      { key: "stage", label: "Tahap" },
      { key: "samples", label: "Sampel", type: "number" },
      { key: "avgDays", label: "Rata-rata kalender", type: "days" },
      { key: "medianDays", label: "Median kalender", type: "days" },
      { key: "avgHours", label: "Rata-rata jam kerja", type: "hours" },
      { key: "medianHours", label: "Median jam kerja", type: "hours" },
      { key: "maxDays", label: "Terlama", type: "days" },
    ],
    rows: out,
    note: "Jam kerja aktif memakai jam & hari kerja di Pengaturan serta daftar hari libur. Waktu persetujuan termasuk waktu menunggu revisi pemohon. Pengiriman dihitung setelah seluruh PO pengajuan diterima.",
  };
}

// --- 4. Anggaran ------------------------------------------------------------
async function budgetReport({ f, depts }: Ctx): Promise<ReportResult> {
  const date = zonedMidnight(f.to);
  const year = Number(dateKeyInTz(date).slice(0, 4));
  const departments = await db.department.findMany({
    where: { isActive: true, ...(depts ? { id: { in: depts } } : {}) },
    orderBy: { name: "asc" },
  });
  const out: ReportRow[] = [];
  for (const d of departments) {
    const b = await budgetStatus(db, d.id, 0, { date });
    const budget = b.budget ? decNum(b.budget) : null;
    const committed = decNum(b.committed);
    const pct = budget ? (committed / budget) * 100 : null;
    out.push({
      department: d.name,
      budget,
      committed,
      remaining: b.remaining ? decNum(b.remaining) : null,
      used: pct,
      state: budget === null ? "Belum ada pagu" : pct! > 100 ? "Melebihi pagu" : pct! >= 80 ? "Mendekati batas" : "Aman",
    });
  }
  const withBudget = out.filter((r) => r.budget !== null);
  return {
    summary: [
      { label: `Total pagu ${year}`, value: withBudget.reduce((a, r) => a + (r.budget as number), 0), type: "money" },
      { label: "Total komitmen", value: out.reduce((a, r) => a + (r.committed as number), 0), type: "money" },
      { label: "Bagian melebihi pagu", value: out.filter((r) => r.state === "Melebihi pagu").length, type: "number" },
      { label: "Mendekati batas (≥ 80%)", value: out.filter((r) => r.state === "Mendekati batas").length, type: "number" },
    ],
    chart: {
      title: `Pemakaian pagu ${year}`,
      kind: "bar",
      type: "percent",
      data: withBudget.map((r) => ({ label: r.department as string, value: Math.round(r.used as number) })),
    },
    columns: [
      { key: "department", label: "Bagian" },
      { key: "budget", label: "Pagu", type: "money" },
      { key: "committed", label: "Komitmen", type: "money" },
      { key: "remaining", label: "Sisa", type: "money" },
      { key: "used", label: "Terpakai", type: "percent" },
      { key: "state", label: "Keterangan" },
    ],
    rows: out,
    note: `Tahun anggaran ${year} (mengikuti tanggal akhir filter). Komitmen = nilai estimasi pengajuan yang sudah dikirim dan tidak dibatalkan. Peringatan anggaran tidak memblokir transaksi.`,
  };
}

// --- 5. Riwayat pengajuan ---------------------------------------------------
async function historyReport({ f, depts }: Ctx): Promise<ReportResult> {
  const rows = await db.request.findMany({
    where: requestWhere(f, depts, "submittedAt"),
    orderBy: { submittedAt: "desc" },
    take: MAX_ROWS,
    include: {
      requester: { select: { fullName: true } },
      department: { select: { name: true } },
      items: { select: { category: { select: { name: true } } } },
    },
  });
  const byDept = new Map<string, number>();
  for (const r of rows) byDept.set(r.department.name, (byDept.get(r.department.name) ?? 0) + 1);
  return {
    summary: [
      { label: "Pengajuan", value: rows.length, type: "number" },
      { label: "Nilai estimasi", value: rows.reduce((a, r) => a + decNum(r.estimatedTotal), 0), type: "money" },
      { label: "Pemohon", value: new Set(rows.map((r) => r.requesterId)).size, type: "number" },
      { label: "Direvisi", value: rows.filter((r) => r.currentVersionNumber > 1).length, type: "number", hint: "dikirim ulang ≥ 1 kali" },
    ],
    chart: {
      title: "Pengajuan per bagian",
      kind: "bar",
      type: "number",
      data: [...byDept.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
    },
    columns: [
      { key: "number", label: "No. pengajuan" },
      { key: "submittedAt", label: "Diajukan", type: "date" },
      { key: "title", label: "Judul" },
      { key: "requester", label: "Pemohon" },
      { key: "department", label: "Bagian" },
      { key: "categories", label: "Kategori" },
      { key: "priority", label: "Prioritas" },
      { key: "status", label: "Status" },
      { key: "value", label: "Nilai estimasi", type: "money" },
      { key: "versions", label: "Versi", type: "number" },
      { key: "neededDate", label: "Dibutuhkan", type: "date" },
      { key: "completedAt", label: "Selesai", type: "date" },
    ],
    rows: rows.map((r) => ({
      _href: `/pengajuan/${r.id}`,
      number: r.requestNumber,
      submittedAt: iso(r.submittedAt),
      title: r.title,
      requester: r.requester.fullName,
      department: r.department.name,
      categories: [...new Set(r.items.map((i) => i.category?.name).filter(Boolean))].join(", ") || null,
      priority: PRIORITY[effectivePriority(r)].label,
      status: REQUEST_STATUS[r.status].label,
      value: decNum(r.estimatedTotal),
      versions: r.currentVersionNumber,
      neededDate: dateKey(r.neededDate),
      completedAt: iso(r.completedAt),
    })),
  };
}

// --- 6. Riwayat persetujuan & revisi ---------------------------------------
async function approvalReport({ f, depts }: Ctx): Promise<ReportResult> {
  const reqFilter = requestWhere({ ...f, status: undefined, categoryId: undefined, purchaserId: undefined }, depts);
  const rows = await db.approvalDecision.findMany({
    where: { decidedAt: dateRange(f), assignment: { step: { instance: { request: reqFilter } } } },
    orderBy: { decidedAt: "desc" },
    take: MAX_ROWS,
    include: {
      decidedBy: { select: { fullName: true } },
      assignment: {
        select: {
          activatedAt: true,
          assignedAt: true,
          step: { select: { name: true, instance: { select: { subjectType: true, request: { select: { id: true, requestNumber: true, title: true } } } } } },
        },
      },
    },
  });
  const cal = await loadWorkCalendar();
  const byApprover = new Map<string, number>();
  const waits: number[] = [];
  const out: ReportRow[] = rows.map((d) => {
    const inst = d.assignment.step.instance;
    const start = d.assignment.activatedAt ?? d.assignment.assignedAt;
    const wait = workingHoursBetween(start, d.decidedAt, cal);
    waits.push(wait);
    byApprover.set(d.decidedBy.fullName, (byApprover.get(d.decidedBy.fullName) ?? 0) + 1);
    const reject = d.decision === "REJECT";
    return {
      _href: `/pengajuan/${inst.request.id}`,
      decidedAt: iso(d.decidedAt),
      number: inst.request.requestNumber,
      title: inst.request.title,
      subject: APPROVAL_SUBJECT[inst.subjectType],
      step: d.assignment.step.name,
      approver: d.decidedBy.fullName,
      decision: reject ? (inst.subjectType === "REQUEST" ? "Dikembalikan untuk revisi" : "Ditolak") : "Disetujui",
      comment: d.comment,
      wait,
    };
  });
  return {
    summary: [
      { label: "Keputusan", value: rows.length, type: "number" },
      { label: "Disetujui", value: rows.filter((d) => d.decision === "APPROVE").length, type: "number" },
      { label: "Dikembalikan / ditolak", value: rows.filter((d) => d.decision === "REJECT").length, type: "number" },
      { label: "Median waktu respons", value: median(waits), type: "hours", hint: "jam kerja aktif" },
    ],
    chart: {
      title: "Keputusan per pemberi persetujuan",
      kind: "bar",
      type: "number",
      data: [...byApprover.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label, value]) => ({ label, value })),
    },
    columns: [
      { key: "decidedAt", label: "Tanggal", type: "datetime" },
      { key: "number", label: "No. pengajuan" },
      { key: "title", label: "Judul" },
      { key: "subject", label: "Jenis" },
      { key: "step", label: "Tahap" },
      { key: "approver", label: "Pemberi keputusan" },
      { key: "decision", label: "Keputusan" },
      { key: "comment", label: "Catatan" },
      { key: "wait", label: "Waktu respons", type: "hours" },
    ],
    rows: out,
  };
}

// --- 7. Urgensi -------------------------------------------------------------
async function urgencyReport({ f, depts }: Ctx): Promise<ReportResult> {
  const rows = await db.request.findMany({
    where: requestWhere(f, depts, "submittedAt"),
    take: MAX_ROWS,
    select: { finalPriority: true, requestedPriority: true, status: true, submittedAt: true, completedAt: true, neededDate: true },
  });
  const today = todayDateOnly();
  const groups = new Map<Priority, typeof rows>();
  for (const r of rows) groups.set(effectivePriority(r), [...(groups.get(effectivePriority(r)) ?? []), r]);
  const out = PRIORITY_ORDER.filter((p) => groups.has(p)).map((p) => {
    const g = groups.get(p)!;
    const done = g.filter((r) => r.completedAt);
    const onTime = done.filter((r) => dateKeyInTz(r.completedAt!) <= dateKey(r.neededDate)!);
    const totals = done.filter((r) => r.submittedAt).map((r) => days(r.submittedAt!, r.completedAt!));
    return {
      priority: PRIORITY[p].label,
      count: g.length,
      changed: g.filter((r) => r.finalPriority && r.finalPriority !== r.requestedPriority).length,
      completed: done.length,
      onTime: done.length ? (onTime.length / done.length) * 100 : null,
      medianDays: median(totals),
      overdue: g.filter((r) => OPEN_STATUSES.includes(r.status) && r.neededDate < today).length,
    };
  });
  return {
    summary: [
      { label: "Pengajuan", value: rows.length, type: "number" },
      { label: "Mendesak + tinggi", value: rows.filter((r) => ["URGENT", "HIGH"].includes(effectivePriority(r))).length, type: "number" },
      { label: "Prioritas disesuaikan", value: out.reduce((a, r) => a + r.changed, 0), type: "number", hint: "prioritas akhir ≠ usulan pemohon" },
      { label: "Berjalan & lewat tgl dibutuhkan", value: out.reduce((a, r) => a + r.overdue, 0), type: "number" },
    ],
    chart: { title: "Pengajuan per prioritas akhir", kind: "bar", type: "number", data: out.map((r) => ({ label: r.priority, value: r.count })) },
    columns: [
      { key: "priority", label: "Prioritas akhir" },
      { key: "count", label: "Jumlah", type: "number" },
      { key: "changed", label: "Disesuaikan", type: "number" },
      { key: "completed", label: "Selesai", type: "number" },
      { key: "onTime", label: "Selesai tepat waktu", type: "percent" },
      { key: "medianDays", label: "Median lama selesai", type: "days" },
      { key: "overdue", label: "Berjalan & terlambat", type: "number" },
    ],
    rows: out,
    note: "Tepat waktu = selesai pada atau sebelum tanggal dibutuhkan.",
  };
}

// --- 8. Pembatalan ----------------------------------------------------------
async function cancellationReport({ f, depts }: Ctx): Promise<ReportResult> {
  const rows = await db.request.findMany({
    where: { AND: [requestWhere({ ...f, status: undefined }, depts, "cancelledAt"), { status: "CANCELLED" }] },
    orderBy: { cancelledAt: "desc" },
    take: MAX_ROWS,
    include: {
      requester: { select: { fullName: true } },
      department: { select: { name: true } },
      cancelledBy: { select: { fullName: true } },
      cancellationRequests: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const stageOf = (r: (typeof rows)[number]) => (r.cancellationRequests[0] ? REQUEST_STATUS[r.cancellationRequests[0].previousStatus].label : r.approvedAt ? "Setelah disetujui" : "Sebelum disetujui");
  const byStage = new Map<string, number>();
  for (const r of rows) byStage.set(stageOf(r), (byStage.get(stageOf(r)) ?? 0) + 1);
  return {
    summary: [
      { label: "Dibatalkan", value: rows.length, type: "number" },
      { label: "Nilai estimasi", value: rows.reduce((a, r) => a + decNum(r.estimatedTotal), 0), type: "money" },
      { label: "Oleh pemohon sendiri", value: rows.filter((r) => r.cancelledById === r.requesterId).length, type: "number" },
      { label: "Lewat persetujuan pembatalan", value: rows.filter((r) => r.cancellationRequests.length > 0).length, type: "number" },
    ],
    chart: { title: "Pembatalan per tahap", kind: "bar", type: "number", data: [...byStage.entries()].map(([label, value]) => ({ label, value })) },
    columns: [
      { key: "cancelledAt", label: "Dibatalkan", type: "date" },
      { key: "number", label: "No. pengajuan" },
      { key: "title", label: "Judul" },
      { key: "department", label: "Bagian" },
      { key: "requester", label: "Pemohon" },
      { key: "stage", label: "Tahap saat dibatalkan" },
      { key: "reason", label: "Alasan" },
      { key: "by", label: "Dibatalkan oleh" },
      { key: "value", label: "Nilai estimasi", type: "money" },
    ],
    rows: rows.map((r) => ({
      _href: `/pengajuan/${r.id}`,
      cancelledAt: iso(r.cancelledAt),
      number: r.requestNumber,
      title: r.title,
      department: r.department.name,
      requester: r.requester.fullName,
      stage: stageOf(r),
      reason: r.cancellationReason,
      by: r.cancelledBy?.fullName ?? null,
      value: decNum(r.estimatedTotal),
    })),
  };
}

// --- 9. Pesanan & vendor ----------------------------------------------------
async function orderReport({ f, depts }: Ctx): Promise<ReportResult> {
  const rows = await db.purchaseOrder.findMany({
    where: purchaseOrderWhere(f, depts, "orderedAt"),
    orderBy: { orderedAt: "desc" },
    take: MAX_ROWS,
    include: {
      vendor: { select: { name: true } },
      purchasingOwner: { select: { fullName: true } },
      requestLinks: { select: { request: { select: { requestNumber: true } } } },
    },
  });
  const byVendor = new Map<string, number>();
  let onTime = 0;
  let measured = 0;
  const out: ReportRow[] = rows.map((p) => {
    const vendor = p.vendor?.name ?? "—";
    byVendor.set(vendor, (byVendor.get(vendor) ?? 0) + decNum(p.totalAmount));
    let timely: string | null = null;
    if (p.receivedAt && p.expectedDeliveryDate) {
      measured++;
      const ok = dateKeyInTz(p.receivedAt) <= dateKey(p.expectedDeliveryDate)!;
      if (ok) onTime++;
      timely = ok ? "Ya" : "Tidak";
    }
    return {
      _href: `/purchasing/po/${p.id}`,
      number: p.poNumber,
      orderedAt: iso(p.orderedAt),
      vendor,
      owner: p.purchasingOwner.fullName,
      requests: p.requestLinks.map((l) => l.request.requestNumber).filter(Boolean).join(", "),
      status: PO_STATUS[p.status].label,
      total: decNum(p.totalAmount),
      eta: dateKey(p.currentEta ?? p.expectedDeliveryDate),
      receivedAt: iso(p.receivedAt),
      leadTime: p.orderedAt && p.receivedAt ? days(p.orderedAt, p.receivedAt) : null,
      timely,
    };
  });
  return {
    summary: [
      { label: "PO dipesan", value: rows.length, type: "number" },
      { label: "Nilai pesanan", value: rows.reduce((a, p) => a + decNum(p.totalAmount), 0), type: "money" },
      { label: "Vendor", value: byVendor.size, type: "number" },
      { label: "Tepat waktu", value: measured ? (onTime / measured) * 100 : null, type: "percent", hint: `${measured} PO sudah diterima` },
    ],
    chart: {
      title: "Nilai pesanan per vendor",
      kind: "bar",
      type: "money",
      data: [...byVendor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label, value]) => ({ label, value })),
    },
    columns: [
      { key: "number", label: "No. PO" },
      { key: "orderedAt", label: "Dipesan", type: "date" },
      { key: "vendor", label: "Vendor" },
      { key: "owner", label: "Petugas" },
      { key: "requests", label: "Pengajuan" },
      { key: "status", label: "Status" },
      { key: "total", label: "Nilai", type: "money" },
      { key: "eta", label: "ETA", type: "date" },
      { key: "receivedAt", label: "Diterima lengkap", type: "date" },
      { key: "leadTime", label: "Lama kirim", type: "days" },
      { key: "timely", label: "Tepat waktu" },
    ],
    rows: out,
  };
}

// --- 10. Keterlambatan & tindak lanjut -------------------------------------
async function delayReport({ f, depts }: Ctx): Promise<ReportResult> {
  const today = todayDateOnly();
  const base = purchaseOrderWhere(f, depts);
  const rows = await db.purchaseOrder.findMany({
    where: {
      AND: [
        base,
        {
          OR: [
            { status: { in: OPEN_PO }, OR: [{ currentEta: { lt: today } }, { currentEta: null, expectedDeliveryDate: { lt: today } }] },
            { receivedAt: dateRange(f), expectedDeliveryDate: { not: null } },
          ],
        },
      ],
    },
    take: MAX_ROWS,
    include: {
      vendor: { select: { name: true } },
      purchasingOwner: { select: { fullName: true } },
      followups: { orderBy: { createdAt: "desc" } },
    },
  });
  const late = rows
    .map((p) => {
      const promised = p.expectedDeliveryDate;
      const eta = p.currentEta ?? promised;
      const open = OPEN_PO.includes(p.status);
      let lateDays = 0;
      if (open && eta) lateDays = Math.floor(days(eta, today));
      else if (p.receivedAt && promised) lateDays = Math.floor(days(promised, zonedMidnight(dateKeyInTz(p.receivedAt))));
      return { p, lateDays, open };
    })
    .filter((x) => x.lateDays > 0)
    .sort((a, b) => b.lateDays - a.lateDays);
  const byVendor = new Map<string, number>();
  for (const x of late) byVendor.set(x.p.vendor?.name ?? "—", (byVendor.get(x.p.vendor?.name ?? "—") ?? 0) + 1);
  const followupsInRange = late.flatMap((x) => x.p.followups).filter((u) => u.createdAt >= dateRange(f).gte && u.createdAt < dateRange(f).lt);
  return {
    summary: [
      { label: "Masih terlambat", value: late.filter((x) => x.open).length, type: "number" },
      { label: "Terlambat, sudah diterima", value: late.filter((x) => !x.open).length, type: "number", hint: "diterima pada periode" },
      { label: "Median keterlambatan", value: median(late.map((x) => x.lateDays)), type: "days" },
      { label: "Tindak lanjut pada periode", value: followupsInRange.length, type: "number" },
    ],
    chart: {
      title: "PO terlambat per vendor",
      kind: "bar",
      type: "number",
      data: [...byVendor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label, value]) => ({ label, value })),
    },
    columns: [
      { key: "number", label: "No. PO" },
      { key: "vendor", label: "Vendor" },
      { key: "owner", label: "Petugas" },
      { key: "status", label: "Status" },
      { key: "promised", label: "ETA awal", type: "date" },
      { key: "eta", label: "ETA terkini", type: "date" },
      { key: "receivedAt", label: "Diterima", type: "date" },
      { key: "lateDays", label: "Terlambat", type: "days" },
      { key: "followups", label: "Tindak lanjut", type: "number" },
      { key: "lastFollowup", label: "Tindak lanjut terakhir" },
      { key: "reason", label: "Alasan keterlambatan" },
    ],
    rows: late.map(({ p, lateDays }) => {
      const last = p.followups[0];
      const delay = p.followups.find((u) => u.followupType === "DELAY");
      return {
        _href: `/purchasing/po/${p.id}`,
        number: p.poNumber,
        vendor: p.vendor?.name ?? null,
        owner: p.purchasingOwner.fullName,
        status: PO_STATUS[p.status].label,
        promised: dateKey(p.expectedDeliveryDate),
        eta: dateKey(p.currentEta),
        receivedAt: iso(p.receivedAt),
        lateDays,
        followups: p.followups.length,
        lastFollowup: last ? `${dateKey(last.actionDate)} · ${FOLLOWUP_TYPE[last.followupType]}: ${last.actionTaken}` : null,
        reason: delay?.reason ?? null,
      };
    }),
    note: "Mencakup PO yang saat ini melewati ETA (tanpa batas periode) dan PO yang diterima pada periode terpilih setelah tanggal janji vendor.",
  };
}

// --- 11. Masalah penerimaan -------------------------------------------------
async function receivingReport({ f, depts }: Ctx): Promise<ReportResult> {
  const poFilter = purchaseOrderWhere(f, depts);
  const [rows, partial] = await Promise.all([
    db.receiptDiscrepancy.findMany({
      where: { reportedAt: dateRange(f), purchaseOrder: poFilter },
      orderBy: { reportedAt: "desc" },
      take: MAX_ROWS,
      include: {
        purchaseOrder: { select: { id: true, poNumber: true, vendor: { select: { name: true } } } },
        purchaseOrderItem: { select: { itemName: true, unitName: true } },
        reportedBy: { select: { fullName: true } },
      },
    }),
    db.purchaseOrder.count({ where: { AND: [poFilter, { status: "PARTIALLY_RECEIVED" }] } }),
  ]);
  const byType = new Map<string, number>();
  for (const d of rows) byType.set(DISCREPANCY_TYPE[d.type], (byType.get(DISCREPANCY_TYPE[d.type]) ?? 0) + 1);
  return {
    summary: [
      { label: "Masalah dilaporkan", value: rows.length, type: "number" },
      { label: "Belum selesai", value: rows.filter((d) => d.status !== "RESOLVED").length, type: "number" },
      { label: "Median lama penyelesaian", value: median(rows.filter((d) => d.resolvedAt).map((d) => days(d.reportedAt, d.resolvedAt!))), type: "days" },
      { label: "PO diterima sebagian (saat ini)", value: partial, type: "number" },
    ],
    chart: { title: "Masalah per jenis", kind: "bar", type: "number", data: [...byType.entries()].map(([label, value]) => ({ label, value })) },
    columns: [
      { key: "reportedAt", label: "Dilaporkan", type: "date" },
      { key: "po", label: "No. PO" },
      { key: "vendor", label: "Vendor" },
      { key: "item", label: "Barang" },
      { key: "type", label: "Jenis" },
      { key: "quantity", label: "Jumlah", type: "number" },
      { key: "description", label: "Uraian" },
      { key: "status", label: "Status" },
      { key: "resolution", label: "Penyelesaian" },
      { key: "resolvedAt", label: "Diselesaikan", type: "date" },
    ],
    rows: rows.map((d) => ({
      _href: `/purchasing/po/${d.purchaseOrder.id}`,
      reportedAt: iso(d.reportedAt),
      po: d.purchaseOrder.poNumber,
      vendor: d.purchaseOrder.vendor?.name ?? null,
      item: d.purchaseOrderItem.itemName,
      type: DISCREPANCY_TYPE[d.type],
      quantity: decNum(d.quantity),
      description: d.description,
      status: DISCREPANCY_STATUS[d.status].label,
      resolution: d.resolutionType ? `${RESOLUTION_TYPE[d.resolutionType].label}${d.resolutionNote ? ` — ${d.resolutionNote}` : ""}` : null,
      resolvedAt: iso(d.resolvedAt),
    })),
  };
}

// --- 12. Aktivitas Purchasing -----------------------------------------------
async function activityReport({ f, depts }: Ctx): Promise<ReportResult> {
  const range = dateRange(f);
  const officers = await db.user.findMany({
    where: f.purchaserId
      ? { id: f.purchaserId }
      : { roles: { some: { role: { permissions: { some: { permission: { code: PERMISSIONS.PURCHASING_MANAGE } } } } } } },
    select: { id: true, fullName: true, accountStatus: true },
    orderBy: { fullName: "asc" },
  });
  const deptPo = depts ? { requestLinks: { some: { request: { departmentId: { in: depts } } } } } : {};
  const out: ReportRow[] = [];
  for (const o of officers) {
    const owned = { ...deptPo, purchasingOwnerId: o.id };
    const [created, ordered, closed, active, receipts, followups] = await Promise.all([
      db.purchaseOrder.count({ where: { ...owned, createdAt: range } }),
      db.purchaseOrder.findMany({ where: { ...owned, orderedAt: range }, select: { totalAmount: true } }),
      db.purchaseOrder.count({ where: { ...owned, closedAt: range } }),
      db.purchaseOrder.count({ where: { ...owned, status: { notIn: ["CLOSED", "CANCELLED", "RECEIVED"] } } }),
      db.goodsReceipt.count({ where: { receivedById: o.id, receivedAt: range, ...(depts ? { purchaseOrder: deptPo } : {}) } }),
      db.purchaseFollowup.count({ where: { createdById: o.id, createdAt: range, ...(depts ? { purchaseOrder: deptPo } : {}) } }),
    ]);
    if (o.accountStatus !== "ACTIVE" && created + ordered.length + closed + active + receipts + followups === 0) continue;
    out.push({
      officer: o.fullName,
      created,
      ordered: ordered.length,
      value: ordered.reduce((a, p) => a + decNum(p.totalAmount), 0),
      receipts,
      followups,
      closed,
      active,
    });
  }
  return {
    summary: [
      { label: "PO dibuat", value: out.reduce((a, r) => a + (r.created as number), 0), type: "number" },
      { label: "PO dipesan", value: out.reduce((a, r) => a + (r.ordered as number), 0), type: "number" },
      { label: "Nilai dipesan", value: out.reduce((a, r) => a + (r.value as number), 0), type: "money" },
      { label: "PO aktif saat ini", value: out.reduce((a, r) => a + (r.active as number), 0), type: "number" },
    ],
    chart: { title: "PO dipesan per petugas", kind: "bar", type: "number", data: out.map((r) => ({ label: r.officer as string, value: r.ordered as number })) },
    columns: [
      { key: "officer", label: "Petugas" },
      { key: "created", label: "PO dibuat", type: "number" },
      { key: "ordered", label: "PO dipesan", type: "number" },
      { key: "value", label: "Nilai dipesan", type: "money" },
      { key: "receipts", label: "Penerimaan dicatat", type: "number" },
      { key: "followups", label: "Tindak lanjut", type: "number" },
      { key: "closed", label: "PO ditutup", type: "number" },
      { key: "active", label: "PO aktif", type: "number" },
    ],
    rows: out,
  };
}

const RUNNERS: Record<string, (ctx: Ctx) => Promise<ReportResult>> = {
  status: statusReport,
  tertunda: pendingReport,
  durasi: durationReport,
  anggaran: budgetReport,
  riwayat: historyReport,
  persetujuan: approvalReport,
  urgensi: urgencyReport,
  pembatalan: cancellationReport,
  pesanan: orderReport,
  keterlambatan: delayReport,
  penerimaan: receivingReport,
  aktivitas: activityReport,
};

/** Menjalankan laporan dengan menghormati cakupan akses pengguna. */
export async function runReport(user: AuthUser, key: string, f: ReportFilters): Promise<ReportResult> {
  const runner = RUNNERS[key];
  if (!runner) throw new NotFoundError("Laporan tidak ditemukan.");
  const depts = effectiveDepartments(f, reportScope(user));
  const result = await runner({ user, f, depts });
  // Pembulatan nilai durasi/persen agar tampilan dan ekspor konsisten.
  for (const row of result.rows) {
    for (const c of result.columns) {
      const v = row[c.key];
      if (typeof v === "number" && (c.type === "days" || c.type === "hours" || c.type === "percent")) row[c.key] = round1(v);
    }
  }
  return result;
}
