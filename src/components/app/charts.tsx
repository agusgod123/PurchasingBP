"use client";

import Link from "next/link";
import { useState } from "react";
import { Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Datum {
  label: string;
  value: number;
  href?: string;
  hint?: string;
}

type Fmt = (n: number) => string;
const defaultFmt: Fmt = (n) => new Intl.NumberFormat("id-ID").format(n);

/**
 * Daftar batang horizontal satu seri (satu warna). Nilai ditulis di ujung
 * batang; hover/fokus menampilkan rincian (porsi dari total).
 */
export function BarList({ data, format = defaultFmt, emptyText = "Belum ada data." }: { data: Datum[]; format?: Fmt; emptyText?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0);
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!data.length || max === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="space-y-1" role="list">
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        const share = total ? Math.round((d.value / total) * 100) : 0;
        const row = (
          <div
            className={cn("relative grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 outline-none sm:grid-cols-[minmax(0,12rem)_1fr_auto]", active === i && "bg-muted/60")}
            tabIndex={0}
            onPointerEnter={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            aria-label={`${d.label}: ${format(d.value)}`}
          >
            <span className="truncate text-[13px] text-muted-foreground">{d.label}</span>
            <span className="block h-2.5 w-full">
              <span
                className={cn("block h-full rounded-r-[4px] transition-opacity", active !== null && active !== i && "opacity-60")}
                style={{ width: `${Math.max(pct, d.value > 0 ? 2 : 0)}%`, background: "var(--viz-1)" }}
              />
            </span>
            <span className="tabular min-w-12 text-right text-[13px] font-medium">{format(d.value)}</span>
            {active === i && (
              <span className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1 text-xs shadow-md">
                <strong className="tabular">{format(d.value)}</strong>
                <span className="text-muted-foreground">
                  {" "}
                  · {d.label} · {share}% dari total{d.hint ? ` · ${d.hint}` : ""}
                </span>
              </span>
            )}
          </div>
        );
        return <li key={d.label}>{d.href ? <Link href={d.href}>{row}</Link> : row}</li>;
      })}
    </ul>
  );
}

/**
 * Kolom vertikal satu seri untuk tren per periode. Label nilai hanya pada
 * periode terakhir; nilai lain lewat hover/fokus atau tampilan tabel.
 */
export function ColumnChart({ data, format = defaultFmt, height = 160 }: { data: Datum[]; format?: Fmt; height?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(...data.map((d) => d.value), 0);
  const niceMax = max === 0 ? 1 : niceCeil(max);
  const ticks = [niceMax, niceMax / 2, 0];
  const dense = data.length > 24;
  const labelEvery = Math.ceil(data.length / 12);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Table2 className="size-3.5" /> {table ? "Tampilkan grafik" : "Tampilkan tabel"}
        </button>
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 font-medium">Periode</th>
              <th className="py-1.5 text-right font-medium">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-1.5">{d.hint ?? d.label}</td>
                <td className="tabular py-1.5 text-right">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <div className="flex flex-col justify-between pb-6 text-right text-[11px] text-muted-foreground" style={{ height }}>
            {ticks.map((t) => (
              <span key={t} className="tabular leading-none">
                {format(t)}
              </span>
            ))}
          </div>
          <div className="relative">
            <div className="absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: height - 24 }} aria-hidden>
              {ticks.map((t) => (
                <span key={t} className={cn("block border-t", t === 0 ? "border-border" : "border-dashed border-border/60")} />
              ))}
            </div>
            <div className={cn("relative flex items-end", dense ? "gap-px sm:gap-0.5" : "gap-1.5 sm:gap-3")} style={{ height }}>
              {data.map((d, i) => {
                const h = ((height - 24) * d.value) / niceMax;
                const last = i === data.length - 1;
                const showLabel = data.length <= 16 || last || i % labelEvery === 0;
                return (
                  <div
                    key={i}
                    className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none"
                    tabIndex={0}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    aria-label={`${d.label}: ${format(d.value)}`}
                  >
                    {last && d.value > 0 && <span className="tabular mb-1 text-[11px] font-medium">{format(d.value)}</span>}
                    <span
                      className={cn("block w-full max-w-10 rounded-t-[4px] transition-opacity", active !== null && active !== i && "opacity-60")}
                      style={{ height: Math.max(h, d.value > 0 ? 2 : 0), background: "var(--viz-1)" }}
                    />
                    <span className={cn("mt-1.5 h-[18px] text-[11px] text-muted-foreground", dense ? "overflow-visible whitespace-nowrap" : "truncate", !showLabel && "invisible")}>
                      {d.label}
                    </span>
                    {active === i && (
                      <span
                        className={cn(
                          "pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1 text-xs shadow-md",
                          i < 2 && data.length > 4 && "left-0",
                          i > data.length - 3 && data.length > 4 && "right-0",
                        )}
                      >
                        <strong className="tabular">{format(d.value)}</strong> <span className="text-muted-foreground">· {d.hint ?? d.label}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function niceCeil(n: number) {
  const p = 10 ** Math.floor(Math.log10(n));
  const m = n / p;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return step * p;
}

/** Pemakaian anggaran per bagian: batang progres + label status (bukan warna saja). */
export function BudgetBars({
  data,
}: {
  data: Array<{ label: string; used: number; budget: number }>;
}) {
  const fmt = (n: number) => `Rp ${new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(n)}`;
  if (!data.length) return <p className="py-6 text-center text-sm text-muted-foreground">Belum ada anggaran yang diatur.</p>;
  return (
    <ul className="space-y-3">
      {data.map((d) => {
        const pct = d.budget > 0 ? Math.round((d.used / d.budget) * 100) : 0;
        const over = pct > 100;
        const near = pct >= 90 && !over;
        return (
          <li key={d.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="truncate">{d.label}</span>
              <span className="tabular shrink-0 text-muted-foreground">
                {fmt(d.used)} / {fmt(d.budget)} ·{" "}
                <span className={cn("font-medium", over ? "text-red-600 dark:text-red-400" : near ? "text-amber-700 dark:text-amber-400" : "text-foreground")}>
                  {pct}%{over ? " (melebihi)" : near ? " (hampir habis)" : ""}
                </span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--viz-track)" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: over ? "#d03b3b" : "var(--viz-1)" }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
