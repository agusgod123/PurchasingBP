import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { loadAuthUser } from "@/server/auth/user";
import { hashPassword } from "@/server/auth/password";
import { invalidateSettingsCache } from "@/server/settings";
import type { ActorContext } from "@/server/context";
import type { DocumentType, Prisma } from "@/generated/prisma/client";
import { seedBase } from "../../prisma/seed/base-data";

export async function resetDatabase() {
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  invalidateSettingsCache();
  await seedBase(db);
}

let passwordHash: string | null = null;

async function user(
  username: string,
  fullName: string,
  roleCodes: string[],
  departmentId: string | null,
  supervisorEmployeeId: string | null = null,
) {
  passwordHash ??= await hashPassword("Rahasia123");
  const roles = await db.role.findMany({ where: { code: { in: roleCodes } } });
  const employee = departmentId
    ? await db.employee.create({ data: { fullName, departmentId, supervisorId: supervisorEmployeeId, email: `${username}@contoh.id` } })
    : null;
  return db.user.create({
    data: {
      username,
      email: `${username}@contoh.id`,
      fullName,
      passwordHash,
      accountStatus: "ACTIVE",
      employeeId: employee?.id,
      roles: { create: roles.map((r) => ({ roleId: r.id })) },
    },
    include: { employee: true },
  });
}

export async function createOrg() {
  const ops = await db.department.create({ data: { code: "OPS", name: "Operasional" } });
  const it = await db.department.create({ data: { code: "IT", name: "Teknologi Informasi" } });
  const pgd = await db.department.create({ data: { code: "PGD", name: "Pengadaan" } });

  const leader = await user("pimpinan", "Hendra Pimpinan", ["LEADERSHIP", "SUPERVISOR"], ops.id);
  const supervisor = await user("sari", "Sari Supervisor", ["SUPERVISOR"], ops.id, leader.employeeId);
  const requester = await user("budi", "Budi Pemohon", ["EMPLOYEE"], ops.id, supervisor.employeeId);
  const itStaff = await user("dewi", "Dewi IT", ["EMPLOYEE"], it.id, supervisor.employeeId);
  const purchasing = await user("rina", "Rina Purchasing", ["PURCHASING"], pgd.id, leader.employeeId);
  const purchasing2 = await user("yusuf", "Yusuf Purchasing", ["PURCHASING"], pgd.id, leader.employeeId);
  const finance = await user("lina", "Lina Keuangan", ["FINANCE"], pgd.id, leader.employeeId);
  const admin = await user("admin", "Admin Sistem", ["ADMIN"], null);

  await db.department.update({ where: { id: ops.id }, data: { headUserId: supervisor.id } });

  return { departments: { ops, it, pgd }, users: { leader, supervisor, requester, itStaff, purchasing, purchasing2, finance, admin } };
}

export async function ctxOf(userId: string): Promise<ActorContext> {
  const u = await loadAuthUser(db, userId);
  if (!u) throw new Error("user tidak ditemukan");
  return { user: u, ip: "127.0.0.1", userAgent: "vitest" };
}

export async function createRule(input: Prisma.ApprovalRuleCreateInput) {
  return db.approvalRule.create({ data: { code: `R-${randomUUID().slice(0, 8)}`, ...input } as Prisma.ApprovalRuleCreateInput });
}

/** Menambahkan dokumen siap (tanpa menyentuh storage) untuk memenuhi aturan dokumen wajib. */
export async function attachDoc(
  parent: { requestId?: string; purchaseOrderId?: string; vendorQuoteId?: string; goodsReceiptId?: string; handoverId?: string },
  documentType: DocumentType,
  uploadedById: string,
) {
  return db.document.create({
    data: {
      storageKey: `test/${randomUUID()}.pdf`,
      originalFilename: "dokumen.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1234,
      documentType,
      uploadStatus: "READY",
      uploadedById,
      ...parent,
    },
  });
}

export function futureDate(days = 14): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export async function pendingAssignmentFor(userId: string, requestId: string) {
  return db.approvalAssignment.findFirstOrThrow({
    where: { approverUserId: userId, status: "PENDING", step: { instance: { requestId } } },
  });
}
