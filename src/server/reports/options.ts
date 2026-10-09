import "server-only";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/user";
import { PERMISSIONS } from "@/lib/permissions";
import { PRIORITY, REQUEST_STATUS } from "@/lib/status";
import { formatDateOnly } from "@/lib/format";
import { reportScope, type ReportFilters } from "./filters";

export interface ReportOptions {
  departments: Array<{ value: string; label: string }>;
  categories: Array<{ value: string; label: string }>;
  purchasers: Array<{ value: string; label: string }>;
}

/** Pilihan filter, dibatasi pada bagian yang boleh dilihat pengguna. */
export async function reportOptions(user: AuthUser): Promise<ReportOptions> {
  const scope = reportScope(user);
  const [departments, categories, purchasers] = await Promise.all([
    db.department.findMany({ where: { isActive: true, ...(scope ? { id: { in: scope } } : {}) }, orderBy: { name: "asc" } }),
    db.itemCategory.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.user.findMany({
      where: { roles: { some: { role: { permissions: { some: { permission: { code: PERMISSIONS.PURCHASING_MANAGE } } } } } } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);
  return {
    departments: departments.map((d) => ({ value: d.id, label: d.name })),
    categories: categories.map((c) => ({ value: c.id, label: c.name })),
    purchasers: purchasers.map((u) => ({ value: u.id, label: u.fullName })),
  };
}

/** Keterangan filter untuk kepala ekspor. */
export function describeFilters(f: ReportFilters, o: ReportOptions, scoped: boolean): string[] {
  const name = (list: Array<{ value: string; label: string }>, id?: string) => list.find((x) => x.value === id)?.label;
  const parts = [
    f.departmentId && `Bagian: ${name(o.departments, f.departmentId) ?? "—"}`,
    !f.departmentId && scoped && `Bagian: ${o.departments.map((d) => d.label).join(", ") || "—"}`,
    f.categoryId && `Kategori: ${name(o.categories, f.categoryId) ?? "—"}`,
    f.status && `Status: ${REQUEST_STATUS[f.status].label}`,
    f.priority && `Prioritas: ${PRIORITY[f.priority].label}`,
    f.purchaserId && `Petugas: ${name(o.purchasers, f.purchaserId) ?? "—"}`,
  ].filter(Boolean) as string[];
  return [`Periode: ${formatDateOnly(f.from)} – ${formatDateOnly(f.to)}`, ...(parts.length ? [parts.join(" · ")] : [])];
}
