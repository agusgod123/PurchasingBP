import type { Prisma } from "@/generated/prisma/client";
import type { Priority, RequestStatus } from "@/generated/prisma/enums";
import { can, type AuthUser } from "@/server/auth/user";
import { ForbiddenError } from "@/server/errors";
import { addDays, dateKeyInTz, dateOnly, zonedMidnight } from "@/server/time";
import { PERMISSIONS } from "@/lib/permissions";
import { PRIORITY, REQUEST_STATUS } from "@/lib/status";
import { sp, type SearchParams } from "@/lib/list-params";

export type GroupBy = "hari" | "minggu" | "bulan";

export interface ReportFilters {
  from: string;
  to: string;
  groupBy: GroupBy;
  departmentId?: string;
  categoryId?: string;
  status?: RequestStatus;
  priority?: Priority;
  purchaserId?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Default: awal bulan, dua bulan lalu s.d. hari ini (± 3 bulan). */
export function defaultRange(): { from: string; to: string } {
  const today = dateKeyInTz();
  const [y, m] = today.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 3, 1)).toISOString().slice(0, 10), to: today };
}

export function parseReportFilters(params: SearchParams): ReportFilters {
  const d = defaultRange();
  let from = sp(params, "dari");
  let to = sp(params, "sampai");
  from = from && DATE_RE.test(from) ? from : d.from;
  to = to && DATE_RE.test(to) ? to : d.to;
  if (from > to) [from, to] = [to, from];
  const per = sp(params, "per");
  const uuid = (k: string) => {
    const v = sp(params, k);
    return v && UUID_RE.test(v) ? v : undefined;
  };
  const status = sp(params, "status");
  const priority = sp(params, "urgensi");
  return {
    from,
    to,
    groupBy: per === "hari" || per === "minggu" ? per : "bulan",
    departmentId: uuid("bagian"),
    categoryId: uuid("kategori"),
    purchaserId: uuid("petugas"),
    status: status && status in REQUEST_STATUS ? (status as RequestStatus) : undefined,
    priority: priority && priority in PRIORITY ? (priority as Priority) : undefined,
  };
}

/** Parameter URL dari filter (untuk tautan ekspor). */
export function filtersToQuery(f: ReportFilters): URLSearchParams {
  const q = new URLSearchParams({ dari: f.from, sampai: f.to, per: f.groupBy });
  if (f.departmentId) q.set("bagian", f.departmentId);
  if (f.categoryId) q.set("kategori", f.categoryId);
  if (f.status) q.set("status", f.status);
  if (f.priority) q.set("urgensi", f.priority);
  if (f.purchaserId) q.set("petugas", f.purchaserId);
  return q;
}

/**
 * Cakupan bagian untuk laporan: null = semua bagian (report.view_all),
 * selain itu hanya bagian sendiri + bagian dalam cakupan pengguna (FR-RPT-10).
 */
export function reportScope(user: AuthUser): string[] | null {
  if (can(user, PERMISSIONS.REPORT_VIEW_ALL)) return null;
  if (can(user, PERMISSIONS.REPORT_VIEW_DEPARTMENT)) {
    return [...new Set([user.departmentId, ...user.scopes.map((s) => s.departmentId)].filter((x): x is string => !!x))];
  }
  throw new ForbiddenError("Anda tidak memiliki akses laporan.");
}

/** Bagian yang benar-benar dipakai: irisan filter dengan cakupan. */
export function effectiveDepartments(f: ReportFilters, scope: string[] | null): string[] | null {
  if (f.departmentId) return scope && !scope.includes(f.departmentId) ? [] : [f.departmentId];
  return scope;
}

export function dateRange(f: ReportFilters) {
  return { gte: zonedMidnight(f.from), lt: addDays(zonedMidnight(f.to), 1) };
}

export function requestWhere(
  f: ReportFilters,
  depts: string[] | null,
  dateField?: "submittedAt" | "cancelledAt" | "completedAt",
  opts: { ignoreStatus?: boolean } = {},
): Prisma.RequestWhereInput {
  const and: Prisma.RequestWhereInput[] = [{ status: { not: "DRAFT" } }];
  if (depts) and.push({ departmentId: { in: depts } });
  if (f.categoryId) and.push({ items: { some: { categoryId: f.categoryId } } });
  if (f.status && !opts.ignoreStatus) and.push({ status: f.status });
  if (f.priority) and.push({ OR: [{ finalPriority: f.priority }, { finalPriority: null, requestedPriority: f.priority }] });
  if (f.purchaserId) and.push({ purchaseOrderLinks: { some: { purchaseOrder: { purchasingOwnerId: f.purchaserId } } } });
  if (dateField) and.push({ [dateField]: dateRange(f) });
  return { AND: and };
}

export function purchaseOrderWhere(f: ReportFilters, depts: string[] | null, dateField?: "orderedAt" | "createdAt"): Prisma.PurchaseOrderWhereInput {
  const and: Prisma.PurchaseOrderWhereInput[] = [];
  if (depts) and.push({ requestLinks: { some: { request: { departmentId: { in: depts } } } } });
  if (f.purchaserId) and.push({ purchasingOwnerId: f.purchaserId });
  if (dateField) and.push({ [dateField]: dateRange(f) });
  return { AND: and };
}

// --- Pengelompokan periode (harian / mingguan / bulanan) -------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function bucketOf(date: Date, g: GroupBy): string {
  const key = dateKeyInTz(date);
  if (g === "bulan") return key.slice(0, 7);
  if (g === "hari") return key;
  const d = dateOnly(key);
  const weekday = (d.getUTCDay() + 6) % 7; // 0 = Senin
  return addDays(d, -weekday).toISOString().slice(0, 10);
}

export function bucketList(f: ReportFilters, max = 400): string[] {
  const out: string[] = [];
  const end = bucketOf(zonedMidnight(f.to), f.groupBy);
  let cursor = bucketOf(zonedMidnight(f.from), f.groupBy);
  while (out.length < max) {
    out.push(cursor);
    if (cursor >= end) break;
    if (f.groupBy === "bulan") {
      const [y, m] = cursor.split("-").map(Number);
      cursor = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    } else {
      cursor = addDays(dateOnly(cursor), f.groupBy === "minggu" ? 7 : 1).toISOString().slice(0, 10);
    }
  }
  return out;
}

export function bucketLabel(key: string, g: GroupBy): { label: string; hint: string } {
  const [y, m, d] = key.split("-").map(Number);
  if (g === "bulan") return { label: MONTHS[m - 1], hint: `${MONTHS[m - 1]} ${y}` };
  if (g === "hari") return { label: `${d}/${m}`, hint: `${d} ${MONTHS[m - 1]} ${y}` };
  return { label: `${d}/${m}`, hint: `Minggu mulai ${d} ${MONTHS[m - 1]} ${y}` };
}

export const GROUP_LABEL: Record<GroupBy, string> = { hari: "hari", minggu: "minggu", bulan: "bulan" };
