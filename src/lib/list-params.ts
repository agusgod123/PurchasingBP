// Parsing parameter daftar (pencarian, filter, urutan, halaman) dari URL.

export type SearchParams = Record<string, string | string[] | undefined>;

export function sp(params: SearchParams, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v || undefined;
}

export function pageParams(params: SearchParams, pageSize = 20) {
  const page = Math.max(1, Number(sp(params, "page") ?? 1) || 1);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function sortParams<T extends string>(params: SearchParams, allowed: readonly T[], fallback: T) {
  const s = sp(params, "sort") as T | undefined;
  const sort = s && allowed.includes(s) ? s : fallback;
  const dir: "asc" | "desc" = sp(params, "dir") === "asc" ? "asc" : "desc";
  return { sort, dir };
}

export function dateRangeParams(params: SearchParams) {
  const from = sp(params, "from");
  const to = sp(params, "to");
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
  return { from: valid(from), to: valid(to) };
}

/** orderBy Prisma; `nulls: last` hanya untuk kolom yang boleh null. */
export function orderByField(field: string, dir: "asc" | "desc", nullable: readonly string[] = []) {
  return { [field]: nullable.includes(field) ? { sort: dir, nulls: "last" as const } : dir };
}
