import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import type { AccountStatus } from "@/generated/prisma/enums";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { EmptyState, PageHeader, StatusBadge } from "@/components/app/ui";
import { ListToolbar, Pager, QuickTabs } from "@/components/app/list-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/permissions";
import { ACCOUNT_STATUS } from "@/lib/status";
import { formatRelative } from "@/lib/format";
import { pageParams, sp, type SearchParams } from "@/lib/list-params";
import { ActivateButton, NewUserDialog } from "./users-client";

export const metadata: Metadata = { title: "Pengguna" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission(PERMISSIONS.USER_MANAGE);
  const params = await searchParams;
  const status = sp(params, "status") as AccountStatus | undefined;
  const q = sp(params, "q");
  const role = sp(params, "peran");
  const { page, pageSize, skip, take } = pageParams(params, 25);
  const where: Prisma.UserWhereInput = {
    ...(status && status in ACCOUNT_STATUS ? { accountStatus: status } : {}),
    ...(role ? { roles: { some: { role: { code: role } } } } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { username: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total, counts, roles, employees] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: [{ accountStatus: "asc" }, { fullName: "asc" }],
      skip,
      take,
      include: { roles: { include: { role: true } }, employee: { include: { department: true } } },
    }),
    db.user.count({ where }),
    db.user.groupBy({ by: ["accountStatus"], _count: true }),
    db.role.findMany({ orderBy: { name: "asc" } }),
    db.employee.findMany({
      where: { user: null, employmentStatus: "ACTIVE" },
      orderBy: { fullName: "asc" },
      include: { department: true },
    }),
  ]);
  const count = (s: AccountStatus) => counts.find((c) => c.accountStatus === s)?._count ?? 0;

  return (
    <>
      <PageHeader
        title="Pengguna"
        description="Aktifkan pendaftaran baru, atur peran dan cakupan bagian, atau buat akun langsung untuk pegawai."
        actions={
          <NewUserDialog
            roles={roles.map((r) => ({ value: r.id, label: r.name, hint: r.description ?? undefined }))}
            employees={employees.map((e) => ({ value: e.id, label: e.fullName, hint: [e.employeeNumber, e.department.name, e.email].filter(Boolean).join(" · "), email: e.email }))}
          />
        }
      />
      <QuickTabs
        param="status"
        tabs={[
          { value: "all", label: "Semua" },
          { value: "PENDING_ACTIVATION", label: "Menunggu aktivasi", count: count("PENDING_ACTIVATION") },
          { value: "ACTIVE", label: "Aktif", count: count("ACTIVE") },
          { value: "SUSPENDED", label: "Ditangguhkan", count: count("SUSPENDED") },
          { value: "DISABLED", label: "Nonaktif", count: count("DISABLED") },
        ]}
      />
      <ListToolbar placeholder="Cari nama, username, atau email…" filters={[{ key: "peran", label: "Peran", options: roles.map((r) => ({ value: r.code, label: r.name })) }]} />
      {rows.length === 0 ? (
        <EmptyState icon={Users} title="Tidak ada pengguna" description="Ubah filter atau kata kunci." />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pengguna</TableHead>
                  <TableHead className="hidden md:table-cell">Bagian</TableHead>
                  <TableHead className="hidden lg:table-cell">Peran</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Login terakhir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => (
                  <TableRow key={u.id} className="relative">
                    <TableCell className="max-w-0 min-w-52">
                      <Link href={`/admin/pengguna/${u.id}`} className="block after:absolute after:inset-0">
                        <span className="block truncate font-medium">{u.fullName}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {u.username} · {u.email}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{u.employee?.department.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{u.roles.map((r) => r.role.name).join(", ") || "—"}</TableCell>
                    <TableCell>
                      {u.accountStatus === "PENDING_ACTIVATION" ? (
                        <span className="relative z-10 flex items-center gap-2">
                          <StatusBadge {...ACCOUNT_STATUS[u.accountStatus]} />
                          <ActivateButton userId={u.id} />
                        </span>
                      ) : (
                        <StatusBadge {...ACCOUNT_STATUS[u.accountStatus]} />
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right text-xs text-muted-foreground sm:table-cell">{u.lastLoginAt ? formatRelative(u.lastLoginAt) : "Belum pernah"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={page} pageSize={pageSize} total={total} />
        </>
      )}
    </>
  );
}
