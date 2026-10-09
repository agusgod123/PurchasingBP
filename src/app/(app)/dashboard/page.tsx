import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, FilePlus2 } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { dashboardData } from "@/server/queries/dashboard";
import { taskCenter } from "@/server/queries/tasks";
import { PageHeader, Section, StageStepper, StatCard, StatusBadge } from "@/components/app/ui";
import { TaskList } from "@/components/app/task-list";
import { BarList, BudgetBars, ColumnChart } from "@/components/app/charts";
import { Button } from "@/components/ui/button";
import { REQUEST_STATUS, STAGES } from "@/lib/status";
import { formatCurrencyCompact, formatDateOnly, formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Makassar" }).format(new Date()));
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [d, tasks] = await Promise.all([dashboardData(user), taskCenter(user)]);
  const taskGroups = tasks.filter((g) => g.items.length > 0);
  const totalTasks = taskGroups.reduce((a, g) => a + g.items.length, 0);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.fullName.split(" ")[0]}`}
        description={totalTasks > 0 ? `Ada ${totalTasks} hal yang menunggu tindak lanjut Anda.` : "Tidak ada tugas yang menunggu. Semua beres."}
        actions={
          d.canCreate && (
            <Button asChild>
              <Link href="/pengajuan/baru">
                <FilePlus2 className="size-4" /> Buat Pengajuan
              </Link>
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(d.pendingApprovals > 0 || !d.canCreate) && (
          <StatCard
            label="Menunggu persetujuan saya"
            value={d.pendingApprovals}
            hint={d.overdueApprovals ? `${d.overdueApprovals} lewat tenggat` : "Tidak ada yang terlambat"}
            tone={d.overdueApprovals ? "danger" : "warning"}
            href="/persetujuan"
          />
        )}
        {d.canCreate && (d.mineCount > 0 || (!d.overview && !d.purchasingStats)) && (
          <>
            <StatCard label="Pengajuan saya diproses" value={d.stageCounts.approval + d.stageCounts.procurement + d.stageCounts.delivery} hint="Persetujuan, pengadaan, pengiriman" tone="info" href="/pengajuan?tab=aktif" />
            <StatCard label="Siap serah terima" value={d.stageCounts.handover} hint="Konfirmasi setelah menerima barang" tone="violet" href="/pengajuan?tab=tindakan" />
          </>
        )}
        {d.purchasingStats && (
          <>
            <StatCard label="Antrean purchasing" value={d.purchasingStats.queue} hint="Pengajuan menunggu dibelikan" tone="info" href="/purchasing/antrean" />
            <StatCard
              label="PO dalam pengiriman"
              value={d.purchasingStats.shipping}
              hint={d.purchasingStats.late ? `${d.purchasingStats.late} terlambat` : "Semua sesuai jadwal"}
              tone={d.purchasingStats.late ? "danger" : "success"}
              href="/purchasing/po?tab=pengiriman"
            />
            <StatCard label="PO disiapkan" value={d.purchasingStats.preparing} hint="Draf, menunggu perubahan, siap dipesan" href="/purchasing/po?tab=proses" />
            <StatCard
              label="Masalah barang / serah terima"
              value={`${d.purchasingStats.onHold} / ${d.purchasingStats.readyHandover}`}
              hint="PO ditahan / pengajuan siap diserahkan"
              tone={d.purchasingStats.onHold ? "danger" : "violet"}
              href="/tugas"
            />
          </>
        )}
        {d.overview && !d.purchasingStats && (
          <>
            <StatCard label="Pengajuan aktif" value={d.overview.activeCount} hint={d.overview.scopeLabel} tone="info" href="/pengajuan/semua" />
            <StatCard label="Nilai disetujui tahun ini" value={formatCurrencyCompact(d.overview.approvedValueYear)} hint="Berdasarkan estimasi" />
          </>
        )}
        {d.admin && (
          <>
            <StatCard label="Akun menunggu aktivasi" value={d.admin.pendingUsers} tone={d.admin.pendingUsers ? "warning" : "neutral"} href="/admin/pengguna?status=PENDING_ACTIVATION" />
            <StatCard
              label="Pengajuan ditahan"
              value={d.admin.onHold}
              hint={d.admin.activeRules === 0 ? "Belum ada aturan persetujuan aktif!" : "Perlu perbaikan konfigurasi"}
              tone={d.admin.onHold || d.admin.activeRules === 0 ? "danger" : "neutral"}
              href={d.admin.activeRules === 0 ? "/admin/persetujuan" : "/tugas"}
            />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {taskGroups.length > 0 && (
          <Section
            title="Perlu tindakan"
            actions={
              <Link href="/tugas" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Pusat Tugas <ArrowRight className="size-3.5" />
              </Link>
            }
            className="overflow-hidden [&>div]:p-0"
          >
            <TaskList group={{ ...taskGroups[0], items: taskGroups.flatMap((g) => g.items) }} limit={7} />
          </Section>
        )}

        {d.canCreate && d.activeMine.length > 0 && (
          <Section
            title="Pengajuan saya yang berjalan"
            actions={
              <Link href="/pengajuan" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Semua <ArrowRight className="size-3.5" />
              </Link>
            }
          >
            <ul className="space-y-4">
              {d.activeMine.map((r) => (
                <li key={r.id}>
                  <Link href={r.status === "DRAFT" ? `/pengajuan/${r.id}/edit` : `/pengajuan/${r.id}`} className="block space-y-2 rounded-lg p-1 hover:bg-muted/40">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{r.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.requestNumber ?? "Draf"} · diperbarui {formatRelative(r.updatedAt)}
                        </div>
                      </div>
                      <StatusBadge label={REQUEST_STATUS[r.status].label} tone={REQUEST_STATUS[r.status].tone} />
                    </div>
                    <StageStepper current={r.stage} />
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {d.purchasingStats && d.purchasingStats.latePos.length > 0 && (
          <Section title="Pesanan terlambat" description="Catat tindak lanjut: alasan, ETA baru, dan target penyelesaian.">
            <ul className="divide-y">
              {d.purchasingStats.latePos.map((p) => (
                <li key={p.id}>
                  <Link href={`/purchasing/po/${p.id}#tindak-lanjut`} className="flex items-center justify-between gap-3 py-2.5 hover:underline">
                    <span className="text-sm font-medium">{p.poNumber}</span>
                    <span className="truncate text-sm text-muted-foreground">{p.vendor}</span>
                    <span className="shrink-0 text-sm font-medium text-red-600">
                      {p.daysLate} hari · ETA {formatDateOnly(p.currentEta)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {d.overview && (
          <>
            {d.overview.critical.length > 0 && (
              <Section title="Keterlambatan kritis" description={d.overview.scopeLabel}>
                <ul className="space-y-2">
                  {d.overview.critical.map((c) => (
                    <li key={c.id}>
                      <Link href={c.href} className="flex items-start gap-2 rounded-lg p-1.5 hover:bg-muted/40">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{c.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{c.detail}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            <Section title="Pengajuan per status" description={`${d.overview.scopeLabel} · jumlah pengajuan`}>
              <BarList data={d.overview.byStatus} />
            </Section>
            <Section title="Pengajuan masuk per bulan" description="6 bulan terakhir, berdasarkan tanggal diajukan">
              <ColumnChart data={d.overview.trend} />
            </Section>
            <Section title={`Pemakaian anggaran ${new Date().getFullYear()}`} description="Estimasi pengajuan aktif & selesai dibanding anggaran bagian (peringatan, tidak memblokir)">
              <BudgetBars data={d.overview.budgets} />
            </Section>
          </>
        )}

        {d.canCreate && d.activeMine.length === 0 && taskGroups.length === 0 && !d.overview && !d.purchasingStats && (
          <Section title="Mulai di sini">
            <ol className="space-y-3 text-sm">
              {STAGES.slice(0, 5).map((s, i) => (
                <li key={s.key} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                  <span>
                    <strong>{s.label}</strong> — {["isi barang yang dibutuhkan", "atasan menyetujui", "purchasing memproses pembelian", "vendor mengirim barang", "Anda menerima & mengonfirmasi barang"][i]}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        )}
      </div>
    </>
  );
}
