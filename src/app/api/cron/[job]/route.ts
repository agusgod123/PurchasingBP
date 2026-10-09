import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { JOBS, type JobName } from "@/server/jobs/maintenance";

export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Endpoint cron: GET/POST /api/cron/{outbox|approvals|daily|all}
 * Header wajib: Authorization: Bearer <CRON_SECRET> (Vercel Cron mengirimkannya otomatis).
 */
async function handle(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await params;
  if (!(job in JOBS)) return NextResponse.json({ error: "unknown job", jobs: Object.keys(JOBS) }, { status: 404 });
  const started = Date.now();
  try {
    const result = await JOBS[job as JobName]();
    return NextResponse.json({ ok: true, job, ms: Date.now() - started, result });
  } catch (err) {
    console.error(`[cron:${job}]`, err);
    return NextResponse.json({ ok: false, job, error: "job failed" }, { status: 500 });
  }
}

export { handle as GET, handle as POST };
