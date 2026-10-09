import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/current";
import { getDownload } from "@/server/modules/documents/service";
import { AppError } from "@/server/errors";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ctx = await getActor();
    const result = await getDownload(ctx, id);
    if (result.kind === "redirect") return NextResponse.redirect(result.url, { status: 302 });
    const inline = result.mimeType === "application/pdf" || result.mimeType.startsWith("image/");
    return new NextResponse(new Uint8Array(result.data), {
      headers: {
        "Content-Type": result.mimeType,
        "Content-Length": String(result.data.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    const message = err instanceof AppError ? err.message : "Gagal mengunduh dokumen.";
    return new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
