import { z } from "zod";
import type { ActorContext } from "@/server/context";
import { audit } from "@/server/audit";
import { transaction } from "@/server/idempotency";
import { can } from "@/server/auth/user";
import { ForbiddenError, NotFoundError, RuleError, ValidationError } from "@/server/errors";
import { PERMISSIONS } from "@/lib/permissions";

function requireOrgManage(ctx: ActorContext) {
  if (!can(ctx.user, PERMISSIONS.ORG_MANAGE)) throw new ForbiddenError();
}

export const departmentSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,20}$/, "2–20 karakter: huruf, angka, - atau _"),
  name: z.string().trim().min(2, "Nama wajib diisi").max(150),
  parentId: z.string().uuid().nullable(),
  headUserId: z.string().uuid().nullable(),
  isActive: z.boolean(),
});

export async function saveDepartment(ctx: ActorContext, id: string | null, input: z.input<typeof departmentSchema>) {
  requireOrgManage(ctx);
  const data = departmentSchema.parse(input);
  if (id && data.parentId === id) throw new ValidationError("Bagian tidak boleh menjadi induk dirinya.", { parentId: "Tidak valid" });
  return transaction(async (tx) => {
    const dupe = await tx.department.findFirst({ where: { code: data.code, ...(id ? { id: { not: id } } : {}) } });
    if (dupe) throw new ValidationError("Kode sudah dipakai.", { code: "Sudah digunakan" });
    if (id && data.parentId) {
      // Cegah siklus induk.
      let cursor: string | null = data.parentId;
      for (let i = 0; cursor && i < 50; i++) {
        if (cursor === id) throw new ValidationError("Struktur induk membentuk siklus.", { parentId: "Siklus" });
        cursor = (await tx.department.findUnique({ where: { id: cursor }, select: { parentId: true } }))?.parentId ?? null;
      }
    }
    if (id && !data.isActive) {
      const activeUsers = await tx.employee.count({ where: { departmentId: id, user: { accountStatus: "ACTIVE" } } });
      if (activeUsers > 0) throw new RuleError(`Masih ada ${activeUsers} akun aktif di bagian ini. Pindahkan pegawainya terlebih dahulu.`);
    }
    const before = id ? await tx.department.findUnique({ where: { id } }) : null;
    if (id && !before) throw new NotFoundError();
    const row = id ? await tx.department.update({ where: { id }, data }) : await tx.department.create({ data });
    await audit(tx, ctx, { action: id ? "department.update" : "department.create", entityType: "department", entityId: row.id, oldValues: before, newValues: data });
    return { id: row.id };
  });
}

export const employeeSchema = z.object({
  employeeNumber: z.string().trim().max(50).nullable(),
  fullName: z.string().trim().min(2, "Nama wajib diisi").max(200),
  email: z.string().trim().toLowerCase().email("Email tidak valid").nullable().or(z.literal("").transform(() => null)),
  phone: z.string().trim().max(30).nullable(),
  departmentId: z.string().uuid("Pilih bagian"),
  positionName: z.string().trim().max(150).nullable(),
  supervisorId: z.string().uuid().nullable(),
  employmentStatus: z.enum(["ACTIVE", "INACTIVE"]),
});

export async function saveEmployee(ctx: ActorContext, id: string | null, input: z.input<typeof employeeSchema>) {
  requireOrgManage(ctx);
  const data = employeeSchema.parse(input);
  if (id && data.supervisorId === id) throw new ValidationError("Pegawai tidak boleh menjadi atasan dirinya.", { supervisorId: "Tidak valid" });
  const clean = { ...data, employeeNumber: data.employeeNumber || null, phone: data.phone || null, positionName: data.positionName || null };
  return transaction(async (tx) => {
    if (clean.employeeNumber) {
      const dupe = await tx.employee.findFirst({ where: { employeeNumber: clean.employeeNumber, ...(id ? { id: { not: id } } : {}) } });
      if (dupe) throw new ValidationError("Nomor pegawai sudah dipakai.", { employeeNumber: "Sudah digunakan" });
    }
    const before = id ? await tx.employee.findUnique({ where: { id } }) : null;
    if (id && !before) throw new NotFoundError();
    const row = id ? await tx.employee.update({ where: { id }, data: clean }) : await tx.employee.create({ data: { ...clean, sourceSystem: "MANUAL" } });
    await audit(tx, ctx, { action: id ? "employee.update" : "employee.create", entityType: "employee", entityId: row.id, oldValues: before, newValues: clean });
    return { id: row.id };
  });
}

// --- Impor CSV dari HRIS ----------------------------------------------------

/** Parser CSV sederhana (RFC 4180) dengan deteksi pemisah koma / titik koma. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const HEADER_ALIASES: Record<string, string[]> = {
  employeeNumber: ["nomor_pegawai", "no_pegawai", "nip", "employee_number", "employee_id"],
  fullName: ["nama", "nama_lengkap", "full_name", "name"],
  email: ["email"],
  phone: ["telepon", "no_hp", "phone"],
  departmentCode: ["kode_bagian", "bagian", "department_code", "department"],
  positionName: ["jabatan", "position", "position_name"],
  supervisorNumber: ["nomor_atasan", "nip_atasan", "supervisor_number", "supervisor_employee_number"],
  status: ["status", "employment_status"],
};

export interface ImportRow {
  line: number;
  employeeNumber: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  departmentCode: string;
  positionName: string | null;
  supervisorNumber: string | null;
  status: "ACTIVE" | "INACTIVE";
  action?: "create" | "update";
  error?: string;
}

export interface ImportResult {
  rows: ImportRow[];
  created: number;
  updated: number;
  errors: number;
  committed: boolean;
}

/**
 * Impor/sinkron data pegawai dari ekspor HRIS (CSV). Kunci = nomor pegawai.
 * `commit=false` hanya memvalidasi (pratinjau); tidak ada yang ditulis.
 */
export async function importEmployees(ctx: ActorContext, csv: string, commit: boolean): Promise<ImportResult> {
  requireOrgManage(ctx);
  if (csv.length > 2_000_000) throw new ValidationError("File terlalu besar (maks. 2 MB).");
  const table = parseCsv(csv);
  if (table.length < 2) throw new ValidationError("File kosong atau hanya berisi judul kolom.");
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (key: string) => header.findIndex((h) => HEADER_ALIASES[key].includes(h));
  const idx = Object.fromEntries(Object.keys(HEADER_ALIASES).map((k) => [k, col(k)])) as Record<keyof typeof HEADER_ALIASES, number>;
  const missing = ["employeeNumber", "fullName", "departmentCode"].filter((k) => idx[k] < 0);
  if (missing.length) {
    throw new ValidationError(`Kolom wajib tidak ditemukan: ${missing.map((k) => HEADER_ALIASES[k][0]).join(", ")}.`);
  }
  if (table.length > 5001) throw new ValidationError("Maksimal 5.000 baris per impor.");

  return transaction(async (tx) => {
    const departments = new Map((await tx.department.findMany()).map((d) => [d.code.toUpperCase(), d]));
    const existing = new Map(
      (await tx.employee.findMany({ where: { employeeNumber: { not: null } }, select: { id: true, employeeNumber: true } })).map((e) => [e.employeeNumber!, e.id]),
    );
    const get = (r: string[], k: keyof typeof HEADER_ALIASES) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
    const seen = new Set<string>();
    const rows: ImportRow[] = table.slice(1).map((r, i) => {
      const status = get(r, "status").toUpperCase();
      const row: ImportRow = {
        line: i + 2,
        employeeNumber: get(r, "employeeNumber"),
        fullName: get(r, "fullName"),
        email: get(r, "email").toLowerCase() || null,
        phone: get(r, "phone") || null,
        departmentCode: get(r, "departmentCode").toUpperCase(),
        positionName: get(r, "positionName") || null,
        supervisorNumber: get(r, "supervisorNumber") || null,
        status: ["INACTIVE", "NONAKTIF", "KELUAR", "RESIGN"].includes(status) ? "INACTIVE" : "ACTIVE",
      };
      if (!row.employeeNumber) row.error = "Nomor pegawai kosong";
      else if (seen.has(row.employeeNumber)) row.error = "Nomor pegawai ganda di file";
      else if (!row.fullName) row.error = "Nama kosong";
      else if (!departments.has(row.departmentCode)) row.error = `Kode bagian "${row.departmentCode}" tidak dikenal`;
      else if (row.email && !z.string().email().safeParse(row.email).success) row.error = "Email tidak valid";
      seen.add(row.employeeNumber);
      if (!row.error) row.action = existing.has(row.employeeNumber) ? "update" : "create";
      return row;
    });
    const fileNumbers = new Set(rows.map((r) => r.employeeNumber));
    for (const r of rows) {
      if (!r.error && r.supervisorNumber && !fileNumbers.has(r.supervisorNumber) && !existing.has(r.supervisorNumber)) {
        r.error = `Atasan ${r.supervisorNumber} tidak ditemukan`;
        r.action = undefined;
      }
    }
    const valid = rows.filter((r) => !r.error);
    const result: ImportResult = {
      rows,
      created: valid.filter((r) => r.action === "create").length,
      updated: valid.filter((r) => r.action === "update").length,
      errors: rows.length - valid.length,
      committed: false,
    };
    if (!commit) return result;
    if (result.errors > 0) throw new RuleError("Perbaiki baris yang bermasalah sebelum mengimpor.");

    const now = new Date();
    const ids = new Map(existing);
    for (const r of valid) {
      const data = {
        fullName: r.fullName,
        email: r.email,
        phone: r.phone,
        departmentId: departments.get(r.departmentCode)!.id,
        positionName: r.positionName,
        employmentStatus: r.status,
        sourceSystem: "HRIS_CSV",
        sourceEmployeeId: r.employeeNumber,
        importedAt: now,
      };
      const id = ids.get(r.employeeNumber);
      if (id) await tx.employee.update({ where: { id }, data });
      else ids.set(r.employeeNumber, (await tx.employee.create({ data: { ...data, employeeNumber: r.employeeNumber } })).id);
    }
    // Lintasan kedua: hubungan atasan (atasan bisa berada di baris setelahnya).
    for (const r of valid) {
      const supervisorId = r.supervisorNumber ? (ids.get(r.supervisorNumber) ?? null) : null;
      await tx.employee.update({ where: { id: ids.get(r.employeeNumber)! }, data: { supervisorId: supervisorId === ids.get(r.employeeNumber) ? null : supervisorId } });
    }
    await audit(tx, ctx, { action: "employee.import", entityType: "employee", entityId: null, newValues: { created: result.created, updated: result.updated } });
    return { ...result, committed: true };
  });
}
