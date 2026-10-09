"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, SearchX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EmptyState, StatusBadge } from "@/components/app/ui";
import { cn } from "@/lib/utils";
import { FaqDialog, type FaqForm } from "./faq-dialog";

export interface FaqRow extends FaqForm {
  id: string;
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFKD");
}

export function FaqBrowser({ faqs, manage }: { faqs: FaqRow[]; manage: boolean }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(faqs.map((f) => f.category))], [faqs]);
  const filtered = useMemo(() => {
    const terms = normalize(q).split(/\s+/).filter(Boolean);
    return faqs.filter((f) => {
      if (category && f.category !== category) return false;
      if (terms.length === 0) return true;
      const hay = normalize(`${f.question} ${f.answer} ${f.category}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [faqs, q, category]);
  const grouped = useMemo(() => {
    const map = new Map<string, FaqRow[]>();
    for (const f of filtered) map.set(f.category, [...(map.get(f.category) ?? []), f]);
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari pertanyaan, mis. “revisi pengajuan” atau “dokumen”"
            className="h-10 pl-9"
            aria-label="Cari FAQ"
          />
        </div>
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter kategori">
            {[null, ...categories].map((c) => (
              <button
                key={c ?? "all"}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={cn(
                  "rounded-full border px-3 py-1 text-[13px] transition-colors",
                  category === c ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                )}
              >
                {c ?? "Semua"}
              </button>
            ))}
          </div>
        )}
      </div>

      {grouped.length === 0 ? (
        <EmptyState icon={SearchX} title="Tidak ada hasil" description="Coba kata kunci lain, atau kirim tiket ke Admin." />
      ) : (
        grouped.map(([cat, rows]) => (
          <section key={cat} className="space-y-2">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{cat}</h2>
            <div className="divide-y overflow-hidden rounded-xl border bg-card">
              {rows.map((f) => (
                <Collapsible key={f.id} defaultOpen={rows.length === 1 && grouped.length === 1}>
                  <div className="flex items-center gap-1 pr-2">
                    <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-muted/40">
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                      <span className="min-w-0 flex-1">{f.question}</span>
                      {!f.isPublished && <StatusBadge label="Draf" tone="neutral" />}
                    </CollapsibleTrigger>
                    {manage && <FaqDialog faq={f} categories={categories} />}
                  </div>
                  <CollapsibleContent>
                    <div className="px-4 pb-4 pl-11 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{f.answer}</div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
