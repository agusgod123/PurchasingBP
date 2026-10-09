import type { Metadata } from "next";
import { Building2, UsersRound } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { EmptyState, PageHeader, StatusBadge } from "@/components/app/ui";
import { ListToolbar, Pager, QuickTabs } from "@/components/app/list-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/permissions";
import { pageParams, sp, type SearchParams } from "@/lib/list-params";
import { formatDateTime } from "@/lib/format";
import { DepartmentDialog, EmployeeDialog, ImportPanel } from "./org-client";

export const metadata: Metadata = { title: "Bagian & Pegawai" };

export default async function OrganizationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission(PERMISSIONS.ORG_MANAGE);
  const params = await searchParams;
  const tab = sp(params, "tab") ?? "bagian";
  const departments = await db.department.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      parent: { select: { name: true } },
      headUser: { select: { fullName: true } },
      _count: { select: { employees: { where: { employmentStatus: "ACTIVE" } } } },
    },
  });
  const deptOptions = departments.filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name, hint: d.code }));
  const [employeeCount, lastImport] = await Promise.all([
    db.employee.count({ where: { employmentStatus: "ACTIVE" } }),
    db.employee.findFirst({ where: { importedAt: { not: null } }, orderBy: { importedAt: "desc" }, select: { importedAt: true } }),
  ]);

  let content: React.ReactNode;
  if (tab === "pegawai") {
    const q = sp(params, "q");
    const dept = sp(params, "bagian");
    const { page, pageSize, skip, take } = pageParams(params, 25);
    const where: Prisma.EmployeeWhereInput = {
      ...(dept ? { departmentId: dept } : {}),
      ...(sp(params, "status") ? { employmentStatus: sp(params, "status") } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { employeeNumber: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { positionName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total, supervisors] = await Promise.all([
      db.employee.findMany({
        where,
        orderBy: { fullName: "asc" },
        skip,
        take,
        include: { department: true, supervisor: { select: { fullName: true } }, user: { select: { username: true } } },
      }),
      db.employee.count({ where }),
      db.employee.findMany({ where: { employmentStatus: "ACTIVE" }, orderBy: { fullName: "asc" }, include: { department: true } }),
    ]);
    const supervisorOptions = supervisors.map((s) => ({ value: s.id, label: s.fullName, hint: [s.positionName, s.department.name].filter(Boolean).join(" · ") }));
    content = (
      <>
        <ListToolbar
          placeholder="Cari nama, nomor pegawai, jabatan…"
          filters={[
            { key: "bagian", label: "Bagian", options: deptOptions },
            { key: "status", label: "Status", options: [{ value: "ACTIVE", label: "Aktif" }, { value: "INACTIVE", label: "Nonaktif" }] },
          ]}
        >
          <EmployeeDialog departments={deptOptions} supervisors={supervisorOptions} />
        </ListToolbar>
        {rows.length === 0 ? (
          <EmptyState icon={UsersRound} title="Tidak ada pegawai" description="Tambahkan manual atau impor dari HRIS (CSV)." />
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pegawai</TableHead>
                    <TableHead className="hidden md:table-cell">Bagian</TableHead>
                    <TableHead className="hidden lg:table-cell">Atasan langsung</TableHead>
                    <TableHead className="hidden sm:table-cell">Akun</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="max-w-0 min-w-52">
                        <span className="block truncate font-medium">{e.fullName}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[e.employeeNumber, e.positionName].filter(Boolean).join(" · ") || "—"}
                          {e.employmentStatus !== "ACTIVE" && " · nonaktif"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-sm md:table-cell">{e.department.name}</TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">{e.supervisor?.fullName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{e.user?.username ?? "—"}</TableCell>
                      <TableCell>
                        <EmployeeDialog
                          departments={deptOptions}
                          supervisors={supervisorOptions.filter((s) => s.value !== e.id)}
                          employee={{
                            id: e.id,
                            employeeNumber: e.employeeNumber ?? "",
                            fullName: e.fullName,
                            email: e.email ?? "",
                            phone: e.phone ?? "",
                            departmentId: e.departmentId,
                            positionName: e.positionName ?? "",
                            supervisorId: e.supervisorId,
                            employmentStatus: e.employmentStatus === "INACTIVE" ? "INACTIVE" : "ACTIVE",
                          }}
                        />
                      </TableCell>
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
  } else if (tab === "impor") {
    content = <ImportPanel lastImport={lastImport?.importedAt ? formatDateTime(lastImport.importedAt) : null} departmentCodes={departments.filter((d) => d.isActive).map((d) => d.code)} />;
  } else {
    const users = await db.user.findMany({ where: { accountStatus: "ACTIVE" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, username: true } });
    const userOptions = users.map((u) => ({ value: u.id, label: u.fullName, hint: u.username }));
    content = (
      <>
        <div className="mb-4 flex justify-end">
          <DepartmentDialog departments={deptOptions} users={userOptions} />
        </div>
        {departments.length === 0 ? (
          <EmptyState icon={Building2} title="Belum ada bagian" />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bagian</TableHead>
                  <TableHead className="hidden md:table-cell">Induk</TableHead>
                  <TableHead>Kepala bagian</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Pegawai aktif</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <span className="font-medium">{d.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{d.code}</span>
                      {!d.isActive && <StatusBadge label="Nonaktif" className="ml-2" />}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{d.parent?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {d.headUser?.fullName ?? <span className="text-amber-700 dark:text-amber-400">Belum ditetapkan</span>}
                    </TableCell>
                    <TableCell className="tabular hidden text-right text-sm sm:table-cell">{d._count.employees}</TableCell>
                    <TableCell>
                      <DepartmentDialog
                        departments={deptOptions.filter((o) => o.value !== d.id)}
                        users={userOptions}
                        department={{ id: d.id, code: d.code, name: d.name, parentId: d.parentId, headUserId: d.headUserId, isActive: d.isActive }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Bagian & Pegawai"
        description="Struktur organisasi menentukan jalur persetujuan: atasan langsung dan kepala bagian diambil dari sini."
      />
      <QuickTabs
        tabs={[
          { value: "bagian", label: "Bagian", count: departments.filter((d) => d.isActive).length },
          { value: "pegawai", label: "Pegawai", count: employeeCount },
          { value: "impor", label: "Impor dari HRIS" },
        ]}
      />
      {content}
    </>
  );
}
