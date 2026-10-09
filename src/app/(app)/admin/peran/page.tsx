import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { PageHeader } from "@/components/app/ui";
import { PERMISSION_INFO, PERMISSIONS } from "@/lib/permissions";
import { RoleDialog, RoleMatrix } from "./roles-client";

export const metadata: Metadata = { title: "Peran & Izin" };

export default async function RolesPage() {
  await requirePermission(PERMISSIONS.ROLE_MANAGE);
  const roles = await db.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
  });
  const permissions = Object.entries(PERMISSION_INFO).map(([code, info]) => ({ code, ...info }));
  return (
    <>
      <PageHeader
        title="Peran & Izin"
        description="Centang izin untuk tiap peran. Hak menyetujui transaksi TIDAK diatur di sini, melainkan di Matriks Persetujuan."
        actions={<RoleDialog />}
      />
      <RoleMatrix
        permissions={permissions}
        roles={roles.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
          users: r._count.users,
          codes: r.permissions.map((p) => p.permission.code),
        }))}
      />
    </>
  );
}
