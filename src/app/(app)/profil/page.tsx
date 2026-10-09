import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { KeyValue, PageHeader, Section } from "@/components/app/ui";
import { ChangePasswordForm } from "@/components/app/change-password-form";
import { formatDateTime } from "@/lib/format";
import { PERMISSION_INFO, type PermissionCode } from "@/lib/permissions";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const full = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    include: {
      employee: { include: { department: true, supervisor: { select: { fullName: true } } } },
      sessions: { orderBy: { lastSeenAt: "desc" }, take: 5 },
    },
  });
  return (
    <>
      <PageHeader title="Profil" description="Data akun dan pegawai Anda. Perubahan data pegawai dilakukan oleh Admin." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Akun">
          <KeyValue
            items={[
              { label: "Nama", value: full.fullName },
              { label: "Username", value: full.username },
              { label: "Email", value: full.email },
              { label: "Peran", value: user.roleNames.join(", ") || "—" },
              { label: "Bagian", value: full.employee?.department.name },
              { label: "Jabatan", value: full.employee?.positionName },
              { label: "Atasan langsung", value: full.employee?.supervisor?.fullName },
              { label: "No. pegawai", value: full.employee?.employeeNumber },
              { label: "Login terakhir", value: formatDateTime(full.lastLoginAt) },
              { label: "Password diubah", value: formatDateTime(full.passwordChangedAt) },
            ]}
          />
        </Section>
        <Section id="password" title="Ganti password" description="Mengganti password akan mengeluarkan sesi di perangkat lain.">
          <ChangePasswordForm />
        </Section>
        <Section title="Hak akses">
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {[...user.permissions].sort().map((p) => (
              <li key={p} className="text-muted-foreground">
                • {PERMISSION_INFO[p as PermissionCode]?.name ?? p}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Sesi aktif">
          <ul className="space-y-2 text-sm">
            {full.sessions.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span className="truncate text-muted-foreground">{s.userAgent ?? "Perangkat tidak dikenal"}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(s.lastSeenAt)}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
