import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { budgetStatus } from "@/server/modules/budget";
import { decNum } from "@/server/money";
import { yearInTz, zonedMidnight } from "@/server/time";
import { Money, PageHeader, StatusBadge } from "@/components/app/ui";
import { QuickTabs } from "@/components/app/list-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/permissions";
import { sp, type SearchParams } from "@/lib/list-params";
import { BudgetDialog } from "./budget-client";

export const metadata: Metadata = { title: "Anggaran" };

export default async function BudgetPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission(PERMISSIONS.BUDGET_MANAGE);
  const params = await searchParams;
  const current = yearInTz();
  const year = Number(sp(params, "tahun")) || current;
  const departments = await db.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  const rows = [];
  for (const d of departments) {
    const b = await budgetStatus(db, d.id, 0, { date: zonedMidnight(`${year}-07-01`) });
    const record = await db.departmentBudget.findUnique({ where: { departmentId_fiscalYear: { departmentId: d.id, fiscalYear: year } } });
    rows.push({ d, b, record });
  }
  return (
    <>
      <PageHeader
        title="Anggaran"
        description="Pagu per bagian per tahun. Dipakai untuk PERINGATAN saat pengajuan melebihi sisa anggaran — tidak memblokir transaksi."
      />
      <QuickTabs
        param="tahun"
        tabs={[current, current - 1, current + 1].map((y) => ({ value: String(y), label: String(y) }))}
      />
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bagian</TableHead>
              <TableHead className="text-right">Pagu</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Komitmen</TableHead>
              <TableHead className="hidden text-right md:table-cell">Sisa</TableHead>
              <TableHead className="w-40">Terpakai</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ d, b, record }) => {
              const pct = b.budget ? Math.round((decNum(b.committed) / decNum(b.budget)) * 100) : null;
              return (
                <TableRow key={d.id}>
                  <TableCell>
                    <span className="font-medium">{d.name}</span>
                    {record?.notes && <span className="block text-xs text-muted-foreground">{record.notes}</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm">{b.budget ? <Money value={b.budget} /> : <span className="text-muted-foreground">Belum diisi</span>}</TableCell>
                  <TableCell className="hidden text-right text-sm sm:table-cell">
                    <Money value={b.committed} />
                  </TableCell>
                  <TableCell className="hidden text-right text-sm md:table-cell">{b.remaining ? <Money value={b.remaining} /> : "—"}</TableCell>
                  <TableCell>
                    {pct === null ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--viz-track)" }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: "var(--viz-1)" }} />
                        </div>
                        {pct > 100 ? <StatusBadge label={`${pct}%`} tone="danger" /> : <span className="tabular w-10 text-right text-xs">{pct}%</span>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <BudgetDialog
                      departmentId={d.id}
                      departmentName={d.name}
                      year={year}
                      existing={record ? { id: record.id, amount: record.amount.toFixed(0), notes: record.notes ?? "" } : null}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-[13px] text-muted-foreground">
        Komitmen = total estimasi pengajuan yang sudah dikirim pada tahun tersebut dan belum dibatalkan.
      </p>
    </>
  );
}
