import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/auth/current";
import { AppError } from "@/server/errors";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { getSetting } from "@/server/settings";
import { parseReportFilters, reportScope } from "@/server/reports/filters";
import { runReport } from "@/server/reports/definitions";
import { describeFilters, reportOptions } from "@/server/reports/options";
import { toPdf, toXlsx } from "@/server/reports/export";
import { reportMeta } from "@/lib/reports";

export const maxDuration = 60;

/** GET /api/export?laporan=status&format=xlsx|pdf&dari=...&sampai=... — menghormati hak akses laporan. */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getActor();
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const meta = reportMeta(params.laporan ?? "");
    if (!meta) return new NextResponse("Laporan tidak ditemukan.", { status: 404 });
    const format = params.format === "pdf" ? "pdf" : "xlsx";
    const scope = reportScope(ctx.user);
    const f = parseReportFilters(params);
    const [result, options, organization] = await Promise.all([
      runReport(ctx.user, meta.key, f),
      reportOptions(ctx.user),
      getSetting("app.organization_name"),
    ]);
    const exportCtx = { meta, result, filterLines: describeFilters(f, options, scope !== null), organization, generatedBy: ctx.user.fullName };
    const data = format === "pdf" ? await toPdf(exportCtx) : await toXlsx(exportCtx);
    await audit(db, ctx, {
      action: "report.export",
      entityType: "report",
      entityId: null,
      newValues: { report: meta.key, format, filters: f, rows: result.rows.length },
    });
    const filename = `laporan-${meta.key}-${f.from}_${f.to}.${format}`;
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (!(err instanceof AppError)) console.error("[export]", err);
    const status = err instanceof AppError ? err.status : 500;
    const message = err instanceof AppError ? err.message : "Ekspor gagal. Coba lagi atau persempit filter.";
    return new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
