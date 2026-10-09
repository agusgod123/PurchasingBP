"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarList, ColumnChart } from "@/components/app/charts";
import { EmptyState, Section, StatCard } from "@/components/app/ui";
import { formatCell, type ColumnType, type ReportFilterKey, type ReportResult } from "@/lib/reports";
import { PRIORITY, REQUEST_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

const NUMERIC: ColumnType[] = ["money", "number", "percent", "days", "hours"];
const WIDE = new Set(["title", "position", "reason", "comment", "description", "lastFollowup", "resolution", "stage", "requests"]);
/** Baris yang ditampilkan di layar; data lengkap lewat ekspor. */
const SCREEN_ROWS = 300;

function shiftMonths(key: string, months: number) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10);
}

function useReportQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === "all") next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };
  return { params, update, pending };
}

export function ReportFilterBar({
  filters,
  values,
  today,
  options,
}: {
  filters: ReportFilterKey[];
  values: { from: string; to: string; groupBy: string; departmentId?: string; categoryId?: string; status?: string; priority?: string; purchaserId?: string };
  today: string;
  options: { departments: Option[]; categories: Option[]; purchasers: Option[] };
}) {
  const { params, update, pending } = useReportQuery();
  const has = (k: ReportFilterKey) => filters.includes(k);
  const monthStart = `${today.slice(0, 7)}-01`;
  const presets = [
    { label: "Bulan ini", from: monthStart, to: today },
    { label: "3 bulan", from: shiftMonths(today, -2), to: today },
    { label: "Tahun ini", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
  const select = (key: string, label: string, value: string | undefined, opts: Option[]) => (
    <Select value={value ?? "all"} onValueChange={(v) => update({ [key]: v })}>
      <SelectTrigger size="sm" className="h-9 min-w-36" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: semua</SelectItem>
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const active = ["bagian", "kategori", "status", "urgensi", "petugas", "dari", "sampai", "per"].some((k) => params.get(k));

  return (
    <div className="mb-5 space-y-2 rounded-xl border bg-card p-3">
      {has("period") && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Input type="date" className="h-9 w-[9.5rem]" value={values.from} max={values.to} onChange={(e) => update({ dari: e.target.value })} aria-label="Dari tanggal" />
            <span className="text-sm text-muted-foreground">–</span>
            <Input type="date" className="h-9 w-[9.5rem]" value={values.to} min={values.from} onChange={(e) => update({ sampai: e.target.value })} aria-label="Sampai tanggal" />
          </div>
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant={values.from === p.from && values.to === p.to ? "secondary" : "ghost"}
                className="h-8"
                onClick={() => update({ dari: p.from, sampai: p.to })}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {has("department") && options.departments.length > 1 && select("bagian", "Bagian", values.departmentId, options.departments)}
        {has("category") && select("kategori", "Kategori", values.categoryId, options.categories)}
        {has("status") &&
          select(
            "status",
            "Status",
            values.status,
            Object.entries(REQUEST_STATUS)
              .filter(([k]) => k !== "DRAFT")
              .map(([value, s]) => ({ value, label: s.label })),
          )}
        {has("priority") && select("urgensi", "Prioritas", values.priority, Object.entries(PRIORITY).map(([value, p]) => ({ value, label: p.label })))}
        {has("purchaser") && options.purchasers.length > 0 && select("petugas", "Petugas", values.purchaserId, options.purchasers)}
        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => update({ bagian: null, kategori: null, status: null, urgensi: null, petugas: null, dari: null, sampai: null, per: null })}
          >
            <X className="size-4" /> Reset
          </Button>
        )}
        {pending && <Spinner className="size-4 text-muted-foreground" />}
      </div>
    </div>
  );
}

function GroupByToggle({ value }: { value: string }) {
  const { update, pending } = useReportQuery();
  return (
    <div className="flex items-center gap-2">
      {pending && <Spinner className="size-4 text-muted-foreground" />}
      <ToggleGroup type="single" variant="outline" size="sm" value={value} onValueChange={(v) => v && update({ per: v })} aria-label="Kelompokkan per">
        <ToggleGroupItem value="hari">Harian</ToggleGroupItem>
        <ToggleGroupItem value="minggu">Mingguan</ToggleGroupItem>
        <ToggleGroupItem value="bulan">Bulanan</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

export function ReportView({ result, groupBy }: { result: ReportResult; groupBy?: string }) {
  const shown = result.rows.slice(0, SCREEN_ROWS);
  const chartType = result.chart?.type ?? "number";
  const fmt = (n: number) => formatCell(n, chartType);
  return (
    <div className="space-y-5">
      {result.summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {result.summary.map((s) => (
            <StatCard key={s.label} label={s.label} value={formatCell(s.value, s.type)} hint={s.hint} />
          ))}
        </div>
      )}

      {result.chart && result.chart.data.length > 0 && (
        <Section title={result.chart.title} actions={groupBy && result.chart.kind === "column" ? <GroupByToggle value={groupBy} /> : undefined}>
          {result.chart.kind === "column" ? <ColumnChart data={result.chart.data} format={fmt} height={180} /> : <BarList data={result.chart.data} format={fmt} />}
        </Section>
      )}

      <Section
        title="Data"
        description={
          result.rows.length > SCREEN_ROWS
            ? `Menampilkan ${SCREEN_ROWS} dari ${result.rows.length} baris. Ekspor ke Excel untuk data lengkap.`
            : `${result.rows.length} baris`
        }
        className="overflow-hidden [&>div]:p-0 sm:[&>div]:p-0"
      >
        {result.rows.length === 0 ? (
          <EmptyState title="Tidak ada data" description="Ubah periode atau filter." className="m-4 border-0" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {result.columns.map((c) => (
                  <TableHead key={c.key} className={cn("whitespace-nowrap", c.type && NUMERIC.includes(c.type) && "text-right")}>
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r, i) => (
                <TableRow key={i} className={cn(r._href && "relative")}>
                  {result.columns.map((c, ci) => {
                    const text = formatCell(r[c.key] ?? null, c.type);
                    return (
                      <TableCell
                        key={c.key}
                        className={cn(
                          "align-top text-[13px]",
                          c.type && NUMERIC.includes(c.type) ? "tabular text-right whitespace-nowrap" : WIDE.has(c.key) ? "min-w-48 whitespace-normal" : "whitespace-nowrap",
                          text === "—" && "text-muted-foreground",
                        )}
                      >
                        {ci === 0 && r._href ? (
                          <Link href={String(r._href)} className="font-medium text-primary after:absolute after:inset-0 hover:underline">
                            {text}
                          </Link>
                        ) : (
                          text
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      {result.note && <p className="text-[13px] text-muted-foreground">{result.note}</p>}
    </div>
  );
}
