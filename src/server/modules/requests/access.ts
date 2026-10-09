import type { DbOrTx } from "@/server/db";
import type { AuthUser } from "@/server/auth/user";
import { can } from "@/server/auth/user";
import { PERMISSIONS } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Hak melihat DETAIL pengajuan (item, harga, dokumen, riwayat).
 * Ringkasan lintas bagian diatur terpisah (request.view_summary_all).
 */
export async function canViewRequestDetail(
  db: DbOrTx,
  user: AuthUser,
  request: { id: string; requesterId: string; departmentId: string },
): Promise<boolean> {
  if (request.requesterId === user.id) return true;
  if (can(user, PERMISSIONS.REQUEST_VIEW_ALL) || can(user, PERMISSIONS.PURCHASING_MANAGE)) return true;
  if (user.scopes.some((s) => s.departmentId === request.departmentId)) return true;
  const assigned = await db.approvalAssignment.count({
    where: { approverUserId: user.id, step: { instance: { requestId: request.id } } },
  });
  return assigned > 0;
}

/** Filter Prisma untuk daftar pengajuan yang detailnya boleh dilihat pengguna. */
export function detailVisibilityWhere(user: AuthUser): Prisma.RequestWhereInput {
  if (can(user, PERMISSIONS.REQUEST_VIEW_ALL) || can(user, PERMISSIONS.PURCHASING_MANAGE)) return {};
  const deptIds = [...new Set(user.scopes.map((s) => s.departmentId))];
  return {
    OR: [
      { requesterId: user.id },
      ...(deptIds.length ? [{ departmentId: { in: deptIds } }] : []),
      { approvalInstances: { some: { steps: { some: { assignments: { some: { approverUserId: user.id } } } } } } },
    ],
  };
}
