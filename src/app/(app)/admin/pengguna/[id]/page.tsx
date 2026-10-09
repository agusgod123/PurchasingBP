import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { KeyValue, PageHeader, Section, StatusBadge } from "@/components/app/ui";
import { PERMISSIONS } from "@/lib/permissions";
import { ACCOUNT_STATUS } from "@/lib/status";
import { formatDateTime } from "@/lib/format";
import { AccountActions, ProfileForm, RolesForm, ScopesForm } from "./user-detail-client";

export const metadata: Metadata = { title: "Detail Pengguna" };

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePermission(PERMISSIONS.USER_MANAGE);
  const { id } = await params;
  const user = await db.user
    .findUnique({
      where: { id },
      include: {
        roles: true,
        departmentScopes: true,
        employee: { include: { department: true, supervisor: { select: { fullName: true } } } },
        _count: { select: { sessions: true } },
      },
    })
    .catch(() => null);
  if (!user) notFound();
  const [roles, departments, employees, history] = await Promise.all([
    db.role.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { permissions: true } } } }),
    db.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.employee.findMany({
      where: { OR: [{ user: null }, { id: user.employeeId ?? undefined }] },
      orderBy: { fullName: "asc" },
      include: { department: true },
    }),
    db.auditLog.findMany({
      where: { OR: [{ entityType: "user", entityId: id }, { actorId: id, action: { startsWith: "auth." } }] },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { actor: { select: { fullName: true } } },
    }),
  ]);
  const locked = user.lockedUntil && user.lockedUntil > new Date();

  return (
    <>
      <PageHeader
        back={{ href: "/admin/pengguna", label: "Pengguna" }}
        title={user.fullName}
        meta={
          <>
            <span className="text-sm text-muted-foreground">
              {user.username} · {user.email}
            </span>
            <StatusBadge {...ACCOUNT_STATUS[user.accountStatus]} />
            {locked && <StatusBadge label="Terkunci sementara" tone="warning" />}
            {user.mustChangePassword && <StatusBadge label="Wajib ganti password" tone="info" />}
          </>
        }
        actions={<AccountActions userId={user.id} status={user.accountStatus} self={user.id === me.id} sessions={user._count.sessions} />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Data akun" description="Menautkan akun ke data pegawai menentukan bagian dan atasan untuk jalur persetujuan.">
          <ProfileForm
            userId={user.id}
            initial={{ fullName: user.fullName, email: user.email, employeeId: user.employeeId }}
            employees={employees.map((e) => ({ value: e.id, label: e.fullName, hint: [e.employeeNumber, e.department.name].filter(Boolean).join(" · ") }))}
          />
        </Section>
        <Section title="Informasi">
          <KeyValue
            items={[
              { label: "Bagian", value: user.employee?.department.name },
              { label: "Jabatan", value: user.employee?.positionName },
              { label: "Atasan langsung", value: user.employee?.supervisor?.fullName },
              { label: "Login terakhir", value: formatDateTime(user.lastLoginAt) },
              { label: "Diaktifkan", value: formatDateTime(user.activatedAt) },
              { label: "Password diubah", value: formatDateTime(user.passwordChangedAt) },
              { label: "Gagal login berturut-turut", value: String(user.failedLoginCount) },
              { label: "Terkunci sampai", value: locked ? formatDateTime(user.lockedUntil) : "—" },
            ]}
          />
        </Section>
        <Section title="Peran" description="Hak akses berasal dari peran. Peran Admin tidak otomatis berwenang menyetujui transaksi.">
          <RolesForm
            userId={user.id}
            initial={user.roles.map((r) => r.roleId)}
            roles={roles.map((r) => ({ value: r.id, label: r.name, hint: r.description ?? `${r._count.permissions} izin` }))}
          />
        </Section>
        <Section title="Cakupan bagian" description="Akses tambahan ke data bagian lain (mis. kepala divisi yang membawahi beberapa bagian).">
          <ScopesForm
            userId={user.id}
            initial={user.departmentScopes.map((s) => ({ departmentId: s.departmentId, accessLevel: s.accessLevel }))}
            departments={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
        </Section>
        <Section title="Riwayat akun" className="lg:col-span-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada riwayat.</p>
          ) : (
            <ul className="divide-y text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2">
                  <span>
                    <span className="font-medium">{h.action}</span>
                    {h.reason && <span className="text-muted-foreground"> — {h.reason}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {h.actor?.fullName ?? "Sistem"} · {formatDateTime(h.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
