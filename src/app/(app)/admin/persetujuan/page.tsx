import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, GitBranch, Plus } from "lucide-react";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { EmptyState, Money, PageHeader, Section, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/permissions";
import { APPROVAL_SUBJECT, APPROVER_TYPE, ROUTING_MODE } from "@/lib/status";
import { formatRelative } from "@/lib/format";
import { RerouteButton, RuleActiveSwitch } from "./rules-client";

export const metadata: Metadata = { title: "Matriks Persetujuan" };

export default async function ApprovalRulesPage() {
  await requirePermission(PERMISSIONS.APPROVAL_RULE_MANAGE);
  const [rules, held] = await Promise.all([
    db.approvalRule.findMany({
      orderBy: [{ subjectType: "asc" }, { isActive: "desc" }, { priority: "desc" }, { name: "asc" }],
      include: {
        department: { select: { name: true } },
        steps: { orderBy: { stepNumber: "asc" }, include: { approverUser: { select: { fullName: true } }, approverRole: { select: { name: true } } } },
        _count: { select: { instances: true } },
      },
    }),
    db.request.findMany({
      where: { status: "ON_HOLD" },
      orderBy: { updatedAt: "asc" },
      include: { department: { select: { name: true } }, requester: { select: { fullName: true } } },
    }),
  ]);
  const subjects = Object.keys(APPROVAL_SUBJECT) as Array<keyof typeof APPROVAL_SUBJECT>;
  const activeRequestRules = rules.filter((r) => r.subjectType === "REQUEST" && r.isActive).length;

  return (
    <>
      <PageHeader
        title="Matriks Persetujuan"
        description="Aturan menentukan siapa menyetujui apa. Jika tidak ada aturan yang cocok atau ada lebih dari satu dengan prioritas sama, transaksi DITAHAN — sistem tidak menebak."
        actions={
          <Button asChild>
            <Link href="/admin/persetujuan/baru">
              <Plus className="size-4" /> Tambah aturan
            </Link>
          </Button>
        }
      />
      {activeRequestRules === 0 && (
        <div className="mb-5 flex gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Belum ada aturan aktif untuk <strong>Pengajuan</strong>. Pengajuan yang dikirim akan ditahan sampai aturan dibuat. Mulailah dari aturan contoh di bawah, sesuaikan dengan matriks kewenangan resmi, lalu aktifkan.
          </span>
        </div>
      )}

      {held.length > 0 && (
        <Section title={`Pengajuan ditahan (${held.length})`} description="Setelah aturan diperbaiki, proses ulang agar jalur persetujuan dibentuk kembali." className="mb-6">
          <ul className="divide-y">
            {held.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/pengajuan/${r.id}`} className="font-medium hover:underline">
                    {r.requestNumber} · {r.title}
                  </Link>
                  <p className="text-[13px] text-muted-foreground">
                    {r.requester.fullName} · {r.department.name} · <Money value={r.estimatedTotal} /> · {formatRelative(r.updatedAt)}
                  </p>
                  {r.holdReason && <p className="text-[13px] text-amber-700 dark:text-amber-400">{r.holdReason}</p>}
                </div>
                <RerouteButton requestId={r.id} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="space-y-6">
        {subjects.map((s) => {
          const list = rules.filter((r) => r.subjectType === s);
          return (
            <Section key={s} title={APPROVAL_SUBJECT[s]} description={s === "CHANGE_REQUEST" && !list.some((r) => r.isActive) ? "Tanpa aturan aktif: persetujuan bawaan oleh pemohon + atasan langsung pemohon." : undefined} className="overflow-hidden [&>div]:p-0 sm:[&>div]:p-0">
              {list.length === 0 ? (
                <EmptyState icon={GitBranch} title="Belum ada aturan" className="m-4 border-0" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aturan</TableHead>
                      <TableHead className="hidden lg:table-cell">Berlaku untuk</TableHead>
                      <TableHead className="hidden md:table-cell">Tahap</TableHead>
                      <TableHead className="w-24 text-right">Aktif</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((r) => (
                      <TableRow key={r.id} className="relative align-top">
                        <TableCell className="max-w-0 min-w-56">
                          <Link href={`/admin/persetujuan/${r.id}`} className="block after:absolute after:inset-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{r.name}</span>
                              {r.isSample && <StatusBadge label="Contoh" tone="violet" />}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {r.code} · prioritas {r.priority} · {ROUTING_MODE[r.routingMode].label} · dipakai {r._count.instances}×
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="hidden text-[13px] lg:table-cell">
                          {[
                            r.department?.name ?? "Semua bagian",
                            r.minAmount || r.maxAmount ? (
                              <span key="amt">
                                {r.minAmount ? <Money value={r.minAmount} /> : "Rp 0"} – {r.maxAmount ? <Money value={r.maxAmount} /> : "tanpa batas"}
                              </span>
                            ) : (
                              "Semua nilai"
                            ),
                          ].map((x, i) => (
                            <span key={i} className="block">
                              {x}
                            </span>
                          ))}
                        </TableCell>
                        <TableCell className="hidden text-[13px] md:table-cell">
                          <ol className="space-y-0.5">
                            {r.steps.map((st) => (
                              <li key={st.id}>
                                <span className="text-muted-foreground">{st.stepNumber}.</span> {st.name}
                                <span className="text-muted-foreground">
                                  {" "}
                                  ({st.approverType === "USER" ? st.approverUser?.fullName : st.approverType === "ROLE" ? `Peran ${st.approverRole?.name}` : APPROVER_TYPE[st.approverType]}
                                  {st.condition === "OVER_BUDGET" ? ", jika melebihi anggaran" : ""})
                                </span>
                              </li>
                            ))}
                          </ol>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="relative z-10">
                            <RuleActiveSwitch id={r.id} active={r.isActive} />
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Section>
          );
        })}
      </div>
    </>
  );
}
