import { randomInt } from "node:crypto";
import { z } from "zod";
import type { ActorContext } from "@/server/context";
import type { AccountStatus, ScopeAccessLevel } from "@/generated/prisma/enums";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { transaction } from "@/server/idempotency";
import { can } from "@/server/auth/user";
import { hashPassword } from "@/server/auth/password";
import { invalidateUserSessions } from "@/server/auth/session";
import { notify } from "@/server/notifications/notify";
import { ForbiddenError, NotFoundError, RuleError, ValidationError } from "@/server/errors";
import { PERMISSIONS } from "@/lib/permissions";

function requireUserManage(ctx: ActorContext) {
  if (!can(ctx.user, PERMISSIONS.USER_MANAGE)) throw new ForbiddenError();
}

/** Password sementara yang mudah dibacakan: 3 kata acak + angka (tanpa karakter ambigu). */
export function temporaryPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz";
  const chunk = (n: number) => Array.from({ length: n }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${chunk(4)}-${chunk(4)}-${randomInt(1000, 9999)}`;
}

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,50}$/, "3–50 karakter: huruf kecil, angka, titik, minus, garis bawah"),
  email: z.string().trim().toLowerCase().email("Email tidak valid"),
  fullName: z.string().trim().min(2, "Nama wajib diisi").max(200),
  employeeId: z.string().uuid().nullable(),
  roleIds: z.array(z.string().uuid()).default([]),
});

/** Admin membuat akun langsung (aktif) dengan password sementara yang wajib diganti saat login pertama. */
export async function createUser(ctx: ActorContext, input: z.input<typeof createUserSchema>) {
  requireUserManage(ctx);
  const data = createUserSchema.parse(input);
  const exists = await db.user.findFirst({ where: { OR: [{ username: data.username }, { email: data.email }] } });
  if (exists) {
    throw new ValidationError("Username atau email sudah terdaftar.", {
      ...(exists.username === data.username ? { username: "Sudah digunakan" } : {}),
      ...(exists.email === data.email ? { email: "Sudah digunakan" } : {}),
    });
  }
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  return transaction(async (tx) => {
    if (data.employeeId) {
      const emp = await tx.employee.findUnique({ where: { id: data.employeeId }, include: { user: true } });
      if (!emp) throw new ValidationError("Pegawai tidak ditemukan.", { employeeId: "Tidak ditemukan" });
      if (emp.user) throw new ValidationError("Pegawai sudah memiliki akun.", { employeeId: "Sudah punya akun" });
    }
    const user = await tx.user.create({
      data: {
        username: data.username,
        email: data.email,
        fullName: data.fullName,
        passwordHash,
        employeeId: data.employeeId,
        accountStatus: "ACTIVE",
        activatedAt: new Date(),
        mustChangePassword: true,
        roles: { create: data.roleIds.map((roleId) => ({ roleId, assignedById: ctx.user.id })) },
      },
    });
    await audit(tx, ctx, { action: "user.create", entityType: "user", entityId: user.id, newValues: { username: user.username, email: user.email, roleIds: data.roleIds } });
    return { id: user.id, temporaryPassword: password };
  });
}

const STATUS_ACTION: Record<AccountStatus, string> = {
  ACTIVE: "user.activate",
  SUSPENDED: "user.suspend",
  DISABLED: "user.disable",
  PENDING_ACTIVATION: "user.pending",
};

export async function setAccountStatus(ctx: ActorContext, userId: string, status: AccountStatus, reason?: string | null) {
  requireUserManage(ctx);
  if (userId === ctx.user.id && status !== "ACTIVE") throw new RuleError("Anda tidak dapat menonaktifkan akun sendiri.");
  if (status !== "ACTIVE" && !reason?.trim()) throw new ValidationError("Alasan wajib diisi.", { reason: "Wajib diisi" });
  return transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError();
    await tx.user.update({
      where: { id: userId },
      data: {
        accountStatus: status,
        ...(status === "ACTIVE" ? { activatedAt: user.activatedAt ?? new Date(), disabledAt: null, failedLoginCount: 0, lockedUntil: null } : {}),
        ...(status === "DISABLED" ? { disabledAt: new Date() } : {}),
      },
    });
    if (status !== "ACTIVE") await tx.session.deleteMany({ where: { userId } });
    if (status === "ACTIVE" && user.accountStatus === "PENDING_ACTIVATION") {
      await notify(tx, {
        recipientIds: [userId],
        type: "ACCOUNT_ACTIVATED",
        title: "Akun Anda sudah aktif",
        body: "Silakan masuk menggunakan username dan password yang Anda daftarkan.",
        link: "/dashboard",
        mandatory: true,
      });
    }
    await audit(tx, ctx, {
      action: STATUS_ACTION[status],
      entityType: "user",
      entityId: userId,
      oldValues: { accountStatus: user.accountStatus },
      newValues: { accountStatus: status },
      reason: reason?.trim() || null,
    });
  });
}

export const userProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  email: z.string().trim().toLowerCase().email("Email tidak valid"),
  employeeId: z.string().uuid().nullable(),
});

export async function updateUserProfile(ctx: ActorContext, userId: string, input: z.input<typeof userProfileSchema>) {
  requireUserManage(ctx);
  const data = userProfileSchema.parse(input);
  return transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError();
    const dupe = await tx.user.findFirst({ where: { email: data.email, id: { not: userId } } });
    if (dupe) throw new ValidationError("Email sudah dipakai akun lain.", { email: "Sudah digunakan" });
    if (data.employeeId) {
      const linked = await tx.user.findFirst({ where: { employeeId: data.employeeId, id: { not: userId } } });
      if (linked) throw new ValidationError("Pegawai sudah tertaut ke akun lain.", { employeeId: `Tertaut ke ${linked.username}` });
    }
    await tx.user.update({ where: { id: userId }, data });
    await audit(tx, ctx, {
      action: "user.update",
      entityType: "user",
      entityId: userId,
      oldValues: { fullName: user.fullName, email: user.email, employeeId: user.employeeId },
      newValues: data,
    });
  });
}

export async function setUserRoles(ctx: ActorContext, userId: string, roleIds: string[]) {
  requireUserManage(ctx);
  const ids = z.array(z.string().uuid()).parse(roleIds);
  return transaction(async (tx) => {
    const current = await tx.userRole.findMany({ where: { userId }, include: { role: true } });
    // Cegah admin mengunci diri: harus tetap punya izin kelola pengguna.
    if (userId === ctx.user.id) {
      const keeps = await tx.rolePermission.count({ where: { roleId: { in: ids }, permission: { code: PERMISSIONS.USER_MANAGE } } });
      if (keeps === 0) throw new RuleError("Anda tidak dapat mencabut izin kelola pengguna dari akun sendiri.");
    }
    await tx.userRole.deleteMany({ where: { userId, roleId: { notIn: ids } } });
    for (const roleId of ids) {
      if (!current.some((c) => c.roleId === roleId)) await tx.userRole.create({ data: { userId, roleId, assignedById: ctx.user.id } });
    }
    await audit(tx, ctx, {
      action: "user.roles",
      entityType: "user",
      entityId: userId,
      oldValues: { roles: current.map((c) => c.role.code) },
      newValues: { roleIds: ids },
    });
  });
}

export async function setUserScopes(ctx: ActorContext, userId: string, scopes: Array<{ departmentId: string; accessLevel: ScopeAccessLevel }>) {
  requireUserManage(ctx);
  const list = z.array(z.object({ departmentId: z.string().uuid(), accessLevel: z.enum(["READ", "MANAGE", "APPROVE"]) })).parse(scopes);
  return transaction(async (tx) => {
    const before = await tx.userDepartmentScope.findMany({ where: { userId } });
    await tx.userDepartmentScope.deleteMany({ where: { userId } });
    const seen = new Set<string>();
    for (const s of list) {
      const key = `${s.departmentId}:${s.accessLevel}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await tx.userDepartmentScope.create({ data: { userId, ...s } });
    }
    await audit(tx, ctx, { action: "user.scopes", entityType: "user", entityId: userId, oldValues: { scopes: before.map((b) => `${b.departmentId}:${b.accessLevel}`) }, newValues: { scopes: [...seen] } });
  });
}

/** Admin mengatur ulang password: password sementara ditampilkan sekali, sesi lama dicabut. */
export async function adminResetPassword(ctx: ActorContext, userId: string) {
  requireUserManage(ctx);
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  await transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError();
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    await audit(tx, ctx, { action: "user.reset_password", entityType: "user", entityId: userId });
  });
  await invalidateUserSessions(userId);
  return { temporaryPassword: password };
}

export async function revokeUserSessions(ctx: ActorContext, userId: string) {
  requireUserManage(ctx);
  await invalidateUserSessions(userId);
  await transaction((tx) => audit(tx, ctx, { action: "user.revoke_sessions", entityType: "user", entityId: userId }));
}
