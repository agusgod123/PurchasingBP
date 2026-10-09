import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { canAny } from "@/server/auth/user";
import { dateKeyInTz } from "@/server/time";
import { filtersToQuery, parseReportFilters, reportScope } from "@/server/reports/filters";
import { runReport } from "@/server/reports/definitions";
import { reportOptions } from "@/server/reports/options";
import { PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/permissions";
import { REPORTS, reportMeta } from "@/lib/reports";
import { sp, type SearchParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";
import { ReportFilterBar, ReportView } from "./report-client";

export const metadata: Metadata = { title: "Laporan" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canAny(user, [PERMISSIONS.REPORT_VIEW_ALL, PERMISSIONS.REPORT_VIEW_DEPARTMENT])) redirect("/akses-ditolak");
  const params = await searchParams;
  const meta = reportMeta(sp(params, "laporan") ?? "status") ?? REPORTS[0];
  const f = parseReportFilters(params);
  const scoped = reportScope(user) !== null;
  const [result, options] = await Promise.all([runReport(user, meta.key, f), reportOptions(user)]);

  const query = filtersToQuery(f);
  const linkFor = (key: string) => {
    const q = new URLSearchParams(query);
    q.set("laporan", key);
    return `/laporan?${q}`;
  };
  const exportUrl = (format: "xlsx" | "pdf") => {
    const q = new URLSearchParams(query);
    q.set("laporan", meta.key);
    q.set("format", format);
    return `/api/export?${q}`;
  };

  return (
    <>
      <PageHeader
        title={meta.title}
        description={
          <>
            {meta.description}
            {scoped && <span className="block pt-1">Cakupan Anda: {options.departments.map((d) => d.label).join(", ") || "—"}.</span>}
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={exportUrl("xlsx")} download>
                <FileSpreadsheet className="size-4" /> Excel
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={exportUrl("pdf")} download>
                <FileDown className="size-4" /> PDF
              </a>
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <nav aria-label="Jenis laporan" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-1 lg:sticky lg:top-20 lg:flex-col">
            {REPORTS.map((r) => (
              <li key={r.key} className="shrink-0">
                <Link
                  href={linkFor(r.key)}
                  aria-current={r.key === meta.key ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                    r.key === meta.key ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <ReportFilterBar
            filters={meta.filters}
            today={dateKeyInTz()}
            values={{ ...f }}
            options={options}
          />
          <ReportView result={result} groupBy={meta.filters.includes("groupBy") ? f.groupBy : undefined} />
        </div>
      </div>
    </>
  );
}
