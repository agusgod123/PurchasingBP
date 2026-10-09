"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

function useQueryUpdater() {
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
    if (!("page" in patch)) next.delete("page");
    startTransition(() => router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false }));
  };
  return { params, update, pending };
}

export interface FilterDef {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

/** Toolbar pencarian + filter yang disimpan di URL (bisa dibagikan & kembali dengan tombol Back). */
export function ListToolbar({
  placeholder = "Cari…",
  filters = [],
  dateRange = false,
  children,
}: {
  placeholder?: string;
  filters?: FilterDef[];
  dateRange?: boolean;
  children?: React.ReactNode;
}) {
  const { params, update, pending } = useQueryUpdater();
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => update({ q }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = filters.some((f) => params.get(f.key)) || params.get("from") || params.get("to") || params.get("q");

  return (
    <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
      <div className="relative w-full lg:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="h-9 pl-8" aria-label="Cari" />
        {pending && <Spinner className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2" />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Select key={f.key} value={params.get(f.key) ?? "all"} onValueChange={(v) => update({ [f.key]: v })}>
            <SelectTrigger size="sm" className="h-9 min-w-36" aria-label={f.label}>
              <SelectValue placeholder={f.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{f.label}: semua</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {dateRange && (
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              className="h-9 w-[9.5rem]"
              value={params.get("from") ?? ""}
              onChange={(e) => update({ from: e.target.value })}
              aria-label="Dari tanggal"
            />
            <span className="text-sm text-muted-foreground">–</span>
            <Input
              type="date"
              className="h-9 w-[9.5rem]"
              value={params.get("to") ?? ""}
              onChange={(e) => update({ to: e.target.value })}
              aria-label="Sampai tanggal"
            />
          </div>
        )}
        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setQ("");
              update(Object.fromEntries([...filters.map((f) => [f.key, null]), ["q", null], ["from", null], ["to", null]]));
            }}
          >
            <X className="size-4" /> Reset
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}

/** Tab cepat (mis. "Menunggu saya", "Terlambat") berbasis parameter URL. */
export function QuickTabs({ param = "tab", tabs }: { param?: string; tabs: Array<{ value: string; label: string; count?: number }> }) {
  const { params, update } = useQueryUpdater();
  const current = params.get(param) ?? tabs[0]?.value;
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => update({ [param]: t.value === tabs[0]?.value ? null : t.value })}
          className={cn(
            "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            current === t.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cn("rounded-full px-1.5 text-xs", current === t.value ? "bg-primary/10 text-primary" : "bg-muted")}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function SortHeader({ field, label, className }: { field: string; label: string; className?: string }) {
  const { params, update } = useQueryUpdater();
  const sort = params.get("sort");
  const dir = params.get("dir") ?? "desc";
  const active = sort === field;
  return (
    <button
      type="button"
      className={cn("inline-flex items-center gap-1 font-medium hover:text-foreground", active && "text-foreground", className)}
      onClick={() => update({ sort: field, dir: active && dir === "desc" ? "asc" : "desc" })}
    >
      {label}
      {active && (dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />)}
    </button>
  );
}

export function Pager({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    return `${pathname}${next.toString() ? `?${next}` : ""}`;
  };
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        {from}–{to} dari {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" asChild disabled={page <= 1} className={cn(page <= 1 && "pointer-events-none opacity-50")}>
          <Link href={href(page - 1)} aria-label="Halaman sebelumnya">
            <ChevronLeft className="size-4" />
          </Link>
        </Button>
        <span className="px-2">
          {page} / {pages}
        </span>
        <Button variant="outline" size="sm" asChild className={cn(page >= pages && "pointer-events-none opacity-50")}>
          <Link href={href(page + 1)} aria-label="Halaman berikutnya">
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
