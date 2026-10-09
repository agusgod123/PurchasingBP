import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import type { ActorContext } from "@/server/context";
import { checkPasswordPolicy, hashPassword, verifyDummy, verifyPassword } from "@/server/auth/password";
import { createSession, hashToken, invalidateUserSessions } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { transaction } from "@/server/idempotency";
import { notify, queueEmail } from "@/server/notifications/notify";
import { PERMISSIONS } from "@/lib/permissions";
import { RuleError, ValidationError } from "@/server/errors";

const MAX_FAILED_PER_ACCOUNT = 5;
const LOCK_MINUTES = 15;
const MAX_FAILED_PER_IP = 30;
const IP_WINDOW_MINUTES = 15;
const RESET_TTL_MINUTES = 60;

export type LoginResult =
  | { ok: true; token: string; mustChangePassword: boolean }
  | { ok: false; message: string };

const GENERIC_FAIL = "Username/email atau password salah.";

export async function login(identifier: string, password: string, meta: { ip?: string | null; userAgent?: string | null }): Promise<LoginResult> {
  const ident = identifier.trim().toLowerCase();
  if (!ident || !password) return { ok: false, message: GENERIC_FAIL };

  if (meta.ip) {
    const recentFailures = await db.loginAttempt.count({
      where: { ipAddress: meta.ip, success: false, createdAt: { gte: new Date(Date.now() - IP_WINDOW_MINUTES * 60_000) } },
    });
    if (recentFailures >= MAX_FAILED_PER_IP) {
      return { ok: false, message: "Terlalu banyak percobaan masuk dari jaringan ini. Coba lagi beberapa menit lagi." };
    }
  }

  const user = await db.user.findFirst({ where: { OR: [{ username: ident }, { email: ident }] } });
  const record = (success: boolean) =>
    db.loginAttempt.create({ data: { identifier: ident.slice(0, 255), ipAddress: meta.ip ?? null, success } });

  if (!user) {
    await verifyDummy(password);
    await record(false);
    return { ok: false, message: GENERIC_FAIL };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await record(false);
    return { ok: false, message: `Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi setelah ${LOCK_MINUTES} menit.` };
  }
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed >= MAX_FAILED_PER_ACCOUNT ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_PER_ACCOUNT ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
      },
    });
    await record(false);
    return { ok: false, message: GENERIC_FAIL };
  }
  if (user.accountStatus === "PENDING_ACTIVATION") {
    await record(false);
    return { ok: false, message: "Akun Anda menunggu aktivasi oleh Admin." };
  }
  if (user.accountStatus !== "ACTIVE") {
    await record(false);
    return { ok: false, message: "Akun Anda tidak aktif. Hubungi Admin." };
  }
  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await record(true);
  const { token } = await createSession(user.id, { ipAddress: meta.ip, userAgent: meta.userAgent });
  await audit(db, { user: { id: user.id }, ip: meta.ip, userAgent: meta.userAgent }, {
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
  });
  return { ok: true, token, mustChangePassword: user.mustChangePassword };
}

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(3, "Nama lengkap minimal 3 karakter").max(200),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, "Username minimal 3 karakter")
      .max(50)
      .regex(/^[a-z0-9._-]+$/, "Username hanya huruf kecil, angka, titik, garis bawah, atau strip"),
    email: z.string().trim().toLowerCase().email("Email tidak valid").max(255),
    employeeNumber: z.string().trim().max(50).optional().or(z.literal("")),
    departmentId: z.string().uuid("Pilih bagian"),
    positionName: z.string().trim().max(150).optional().or(z.literal("")),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    password: z.string(),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Konfirmasi password tidak sama" });

export type RegisterInput = z.input<typeof registerSchema>;

/** Registrasi mandiri: akun dibuat dengan status menunggu aktivasi Admin (FR-AUTH-02). */
export async function register(input: RegisterInput, meta: { ip?: string | null; userAgent?: string | null }) {
  const data = registerSchema.parse(input);
  const policy = checkPasswordPolicy(data.password, { username: data.username, email: data.email });
  if (policy) throw new ValidationError(policy, { password: policy });
  const dept = await db.department.findUnique({ where: { id: data.departmentId } });
  if (!dept || !dept.isActive) throw new ValidationError("Bagian tidak valid.", { departmentId: "Bagian tidak valid" });
  const exists = await db.user.findFirst({ where: { OR: [{ username: data.username }, { email: data.email }] } });
  if (exists) {
    throw new ValidationError("Username atau email sudah terdaftar.", {
      ...(exists.username === data.username ? { username: "Sudah digunakan" } : {}),
      ...(exists.email === data.email ? { email: "Sudah digunakan" } : {}),
    });
  }
  const passwordHash = await hashPassword(data.password);
  return transaction(async (tx) => {
    // Jika data pegawai sudah diimpor (nomor pegawai/email cocok) dan belum punya akun, tautkan.
    let employee =
      (data.employeeNumber
        ? await tx.employee.findUnique({ where: { employeeNumber: data.employeeNumber }, include: { user: true } })
        : null) ?? null;
    if (employee?.user) employee = null;
    if (!employee) {
      employee = await tx.employee.create({
        data: {
          fullName: data.fullName,
          email: data.email,
          phone: data.phone || null,
          departmentId: data.departmentId,
          positionName: data.positionName || null,
          employeeNumber: data.employeeNumber || null,
          sourceSystem: "SELF_REGISTRATION",
        },
        include: { user: true },
      });
    }
    const user = await tx.user.create({
      data: {
        username: data.username,
        email: data.email,
        fullName: data.fullName,
        passwordHash,
        employeeId: employee.id,
        accountStatus: "PENDING_ACTIVATION",
        passwordChangedAt: new Date(),
      },
    });
    await audit(tx, { user: { id: user.id }, ip: meta.ip, userAgent: meta.userAgent }, {
      action: "auth.register",
      entityType: "user",
      entityId: user.id,
      newValues: { username: user.username, email: user.email, department: dept.name },
    });
    const admins = await tx.user.findMany({
      where: {
        accountStatus: "ACTIVE",
        roles: { some: { role: { permissions: { some: { permission: { code: PERMISSIONS.USER_MANAGE } } } } } },
      },
      select: { id: true },
    });
    await notify(tx, {
      recipientIds: admins.map((a) => a.id),
      type: "ACCOUNT_PENDING",
      title: `Akun baru menunggu aktivasi: ${data.fullName}`,
      body: `${data.fullName} (${data.username}, ${dept.name}) mendaftar dan menunggu aktivasi.`,
      link: `/admin/pengguna?status=PENDING_ACTIVATION`,
    });
    return { id: user.id };
  });
}

/** Selalu mengembalikan sukses agar tidak membocorkan email terdaftar. */
export async function requestPasswordReset(email: string, appUrl: string) {
  const normalized = email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email: normalized } });
  if (!user || user.accountStatus !== "ACTIVE") return;
  const recent = await db.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
  });
  if (recent >= 3) return;
  const token = randomBytes(32).toString("base64url");
  await transaction(async (tx) => {
    await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000) },
    });
    await queueEmail(tx, {
      to: user.email,
      title: "Atur ulang password",
      body: `Halo ${user.fullName},\n\nKami menerima permintaan untuk mengatur ulang password akun Anda. Tautan berlaku ${RESET_TTL_MINUTES} menit. Abaikan email ini jika Anda tidak memintanya.`,
      link: `${appUrl.replace(/\/$/, "")}/reset-password?token=${token}`,
    });
  });
}

export async function resetPassword(token: string, newPassword: string) {
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new RuleError("Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru.");
  }
  const policy = checkPasswordPolicy(newPassword, { username: row.user.username, email: row.user.email });
  if (policy) throw new ValidationError(policy, { password: policy });
  const passwordHash = await hashPassword(newPassword);
  await transaction(async (tx) => {
    await tx.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
    });
    await audit(tx, { user: { id: row.userId } }, { action: "auth.reset_password", entityType: "user", entityId: row.userId });
  });
  await invalidateUserSessions(row.userId);
}

export async function changePassword(ctx: ActorContext, currentPassword: string, newPassword: string, keepSessionId?: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new ValidationError("Password saat ini salah.", { currentPassword: "Password salah" });
  }
  const policy = checkPasswordPolicy(newPassword, { username: user.username, email: user.email });
  if (policy) throw new ValidationError(policy, { newPassword: policy });
  if (await verifyPassword(user.passwordHash, newPassword)) {
    throw new ValidationError("Password baru harus berbeda.", { newPassword: "Harus berbeda dari password lama" });
  }
  const passwordHash = await hashPassword(newPassword);
  await transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false } });
    await audit(tx, ctx, { action: "auth.change_password", entityType: "user", entityId: user.id });
  });
  await invalidateUserSessions(user.id, keepSessionId);
}
