import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/current";
import { verifyUploadToken } from "@/server/storage/tokens";
import { writeLocalUpload } from "@/server/modules/documents/service";
import { getSettings } from "@/server/settings";
import { AppError } from "@/server/errors";

/** Target unggah untuk STORAGE_DRIVER=local (development / server kantor). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!verifyUploadToken(id, token)) return NextResponse.json({ error: "Token unggah tidak valid." }, { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Origin tidak diizinkan." }, { status: 403 });
  try {
    const ctx = await getActor();
    const settings = await getSettings();
    const max = settings["documents.max_file_mb"] * 1024 * 1024;
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > max) return NextResponse.json({ error: "File terlalu besar." }, { status: 413 });
    const body = Buffer.from(await req.arrayBuffer());
    if (body.length > max) return NextResponse.json({ error: "File terlalu besar." }, { status: 413 });
    await writeLocalUpload(ctx, id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    return NextResponse.json({ error: err instanceof AppError ? err.message : "Gagal menyimpan file." }, { status });
  }
}
