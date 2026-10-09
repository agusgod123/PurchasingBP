import { z } from "zod";
import type { ActorContext } from "@/server/context";
import { audit } from "@/server/audit";
import { transaction } from "@/server/idempotency";
import { can } from "@/server/auth/user";
import { ForbiddenError, NotFoundError, RuleError, ValidationError } from "@/server/errors";
import { PERMISSIONS } from "@/lib/permissions";

function requireRoleManage(ctx: ActorContext) {
  if (!can(ctx.user, PERMISSIONS.ROLE_MANAGE)) throw new ForbiddenError();
}

export const roleSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,50}$/, "2–50 karakter: huruf besar, angka, garis bawah"),
  name: z.string().trim().min(2, "Nama wajib diisi").max(100),
  description: z.string().trim().max(500).nullable(),
});

export async function saveRole(ctx: ActorContext, id: string | null, input: z.input<typeof roleSchema>) {
  requireRoleManage(ctx);
  const data = roleSchema.parse(input);
  return transaction(async (tx) => {
    const before = id ? await tx.role.findUnique({ where: { id } }) : null;
    if (id && !before) throw new NotFoundError();
    // Kode peran sistem dipakai oleh seed & dokumentasi; jangan diubah.
    const code = before?.isSystem ? before.code : data.code;
    const dupe = await tx.role.findFirst({ where: { code, ...(id ? { id: { not: id } } : {}) } });
    if (dupe) throw new ValidationError("Kode sudah dipakai.", { code: "Sudah digunakan" });
    const row = id
      ? await tx.role.update({ where: { id }, data: { ...data, code } })
      : await tx.role.create({ data: { ...data, isSystem: false } });
    await audit(tx, ctx, { action: id ? "role.update" : "role.create", entityType: "role", entityId: row.id, oldValues: before, newValues: data });
    return { id: row.id };
  });
}

export async function setRolePermissions(ctx: ActorContext, roleId: string, codes: string[]) {
  requireRoleManage(ctx);
  const list = z.array(z.string()).parse(codes);
  return transaction(async (tx) => {
    const role = await tx.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
    if (!role) throw new NotFoundError();
    const permissions = await tx.permission.findMany({ where: { code: { in: list } } });
    // Cegah admin mengunci diri dari halaman peran.
    const holdsRole = await tx.userRole.findFirst({ where: { userId: ctx.user.id, roleId } });
    if (holdsRole && !list.includes(PERMISSIONS.ROLE_MANAGE)) {
      const elsewhere = await tx.rolePermission.count({
        where: { permission: { code: PERMISSIONS.ROLE_MANAGE }, roleId: { not: roleId }, role: { users: { some: { userId: ctx.user.id } } } },
      });
      if (elsewhere === 0) throw new RuleError("Anda tidak dapat mencabut izin kelola peran dari peran yang Anda pakai sendiri.");
    }
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (permissions.length) await tx.rolePermission.createMany({ data: permissions.map((p) => ({ roleId, permissionId: p.id })) });
    await audit(tx, ctx, {
      action: "role.permissions",
      entityType: "role",
      entityId: roleId,
      oldValues: { permissions: role.permissions.map((p) => p.permission.code).sort() },
      newValues: { permissions: permissions.map((p) => p.code).sort() },
    });
  });
}

export async function deleteRole(ctx: ActorContext, roleId: string) {
  requireRoleManage(ctx);
  return transaction(async (tx) => {
    const role = await tx.role.findUnique({ where: { id: roleId }, include: { _count: { select: { users: true } } } });
    if (!role) throw new NotFoundError();
    if (role.isSystem) throw new RuleError("Peran bawaan tidak dapat dihapus.");
    if (role._count.users > 0) throw new RuleError(`Peran masih dipakai ${role._count.users} pengguna.`);
    const usedInRules = await tx.approvalRuleStep.count({ where: { approverRoleId: roleId } });
    if (usedInRules > 0) throw new RuleError("Peran masih dipakai di matriks persetujuan.");
    await tx.role.delete({ where: { id: roleId } });
    await audit(tx, ctx, { action: "role.delete", entityType: "role", entityId: roleId, oldValues: { code: role.code } });
  });
}
