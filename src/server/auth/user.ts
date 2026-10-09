import type { AccountStatus, ScopeAccessLevel } from "@/generated/prisma/enums";
import type { DbOrTx } from "@/server/db";
import { hasPermission, type PermissionCode } from "@/lib/permissions";

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  accountStatus: AccountStatus;
  mustChangePassword: boolean;
  employeeId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  positionName: string | null;
  roles: string[];
  roleNames: string[];
  permissions: Set<string>;
  scopes: Array<{ departmentId: string; accessLevel: ScopeAccessLevel }>;
}

export async function loadAuthUser(db: DbOrTx, userId: string): Promise<AuthUser | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      employee: { include: { department: true } },
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      departmentScopes: true,
    },
  });
  if (!user) return null;
  const permissions = new Set<string>();
  for (const ur of user.roles) for (const rp of ur.role.permissions) permissions.add(rp.permission.code);
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    accountStatus: user.accountStatus,
    mustChangePassword: user.mustChangePassword,
    employeeId: user.employeeId,
    departmentId: user.employee?.departmentId ?? null,
    departmentName: user.employee?.department.name ?? null,
    positionName: user.employee?.positionName ?? null,
    roles: user.roles.map((r) => r.role.code),
    roleNames: user.roles.map((r) => r.role.name),
    permissions,
    scopes: user.departmentScopes.map((s) => ({ departmentId: s.departmentId, accessLevel: s.accessLevel })),
  };
}

export function can(user: Pick<AuthUser, "permissions">, code: PermissionCode): boolean {
  return hasPermission(user.permissions, code);
}

export function canAny(user: Pick<AuthUser, "permissions">, codes: PermissionCode[]): boolean {
  return codes.some((c) => user.permissions.has(c));
}

/** Bagian yang boleh dilihat detailnya oleh pengguna melalui cakupan (scope). */
export function scopedDepartmentIds(user: Pick<AuthUser, "scopes" | "departmentId">): string[] {
  return [...new Set(user.scopes.map((s) => s.departmentId))];
}

/** Bentuk ringkas yang aman dikirim ke Client Component. */
export interface ClientUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  departmentName: string | null;
  positionName: string | null;
  roleNames: string[];
  permissions: string[];
}

export function toClientUser(user: AuthUser): ClientUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    departmentName: user.departmentName,
    positionName: user.positionName,
    roleNames: user.roleNames,
    permissions: [...user.permissions],
  };
}
