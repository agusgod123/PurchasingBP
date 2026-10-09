import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money, PriorityBadge, StatusBadge } from "@/components/app/ui";
import { SortHeader } from "@/components/app/list-controls";
import { REQUEST_STATUS, STAGES } from "@/lib/status";
import { formatDate, formatDateOnly } from "@/lib/format";
import type { RequestRow } from "@/server/queries/requests";

function StageMini({ stage }: { stage: RequestRow["stage"] }) {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return (
    <div className="flex items-center gap-0.5" aria-label={`Tahap ${STAGES[idx]?.label}`}>
      {STAGES.map((s, i) => (
        <span key={s.key} className={`h-1 w-3 rounded-full ${i <= idx ? "bg-primary" : "bg-muted"}`} />
      ))}
    </div>
  );
}

/** Tabel pengajuan; otomatis menjadi kartu di layar kecil. */
export function RequestTable({
  rows,
  showRequester = false,
  showAmounts = true,
  dateField = "updatedAt",
}: {
  rows: RequestRow[];
  showRequester?: boolean;
  showAmounts?: boolean;
  dateField?: "updatedAt" | "submittedAt";
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[150px]">
                <SortHeader field="requestNumber" label="Nomor" />
              </TableHead>
              <TableHead>Pengajuan</TableHead>
              {showRequester && <TableHead>Pemohon</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead>Prioritas</TableHead>
              <TableHead>
                <SortHeader field="neededDate" label="Dibutuhkan" />
              </TableHead>
              {showAmounts && (
                <TableHead className="text-right">
                  <SortHeader field="estimatedTotal" label="Estimasi" className="ml-auto" />
                </TableHead>
              )}
              <TableHead className="text-right">
                <SortHeader field={dateField} label={dateField === "submittedAt" ? "Diajukan" : "Diperbarui"} className="ml-auto" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const st = REQUEST_STATUS[r.status];
              const href = r.status === "DRAFT" ? `/pengajuan/${r.id}/edit` : `/pengajuan/${r.id}`;
              return (
                <TableRow key={r.id} className="group">
                  <TableCell className="font-medium">
                    {r.canOpen ? (
                      <Link href={href} className="hover:underline">
                        {r.requestNumber ?? "Draf"}
                      </Link>
                    ) : (
                      (r.requestNumber ?? "Draf")
                    )}
                  </TableCell>
                  <TableCell className="max-w-[340px]">
                    <div className="truncate font-medium">{r.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.firstItem ?? "—"}
                      {r.itemCount > 1 && ` +${r.itemCount - 1} item`}
                    </div>
                  </TableCell>
                  {showRequester && (
                    <TableCell>
                      <div className="text-sm">{r.requesterName}</div>
                      <div className="text-xs text-muted-foreground">{r.departmentName}</div>
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="space-y-1.5">
                      <StatusBadge label={st.label} tone={st.tone} />
                      <StageMini stage={r.stage} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={r.priority} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{formatDateOnly(r.neededDate)}</TableCell>
                  {showAmounts && (
                    <TableCell className="text-right text-sm">{r.estimatedTotal ? <Money value={r.estimatedTotal} /> : "—"}</TableCell>
                  )}
                  <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">
                    {formatDate(dateField === "submittedAt" ? r.submittedAt : r.updatedAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-2 md:hidden">
        {rows.map((r) => {
          const st = REQUEST_STATUS[r.status];
          const href = r.status === "DRAFT" ? `/pengajuan/${r.id}/edit` : `/pengajuan/${r.id}`;
          const body = (
            <div className="flex items-start gap-3 rounded-xl border bg-card p-3.5">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{r.requestNumber ?? "Draf"}</span>
                  <StatusBadge label={st.label} tone={st.tone} />
                </div>
                <div className="font-medium leading-snug">{r.title}</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {showRequester && <span>{r.requesterName}</span>}
                  <span>Dibutuhkan {formatDateOnly(r.neededDate)}</span>
                  {showAmounts && r.estimatedTotal && <Money value={r.estimatedTotal} />}
                </div>
                <StageMini stage={r.stage} />
              </div>
              {r.canOpen && <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />}
            </div>
          );
          return <li key={r.id}>{r.canOpen ? <Link href={href}>{body}</Link> : body}</li>;
        })}
      </ul>
    </>
  );
}
