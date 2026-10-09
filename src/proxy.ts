import { NextResponse, type NextRequest } from "next/server";

// Pemeriksaan cepat (optimistik) berbasis keberadaan cookie. Validasi sesi yang
// sebenarnya selalu dilakukan di server (halaman, Server Action, Route Handler).
const PUBLIC_PATHS = ["/login", "/daftar", "/lupa-password", "/reset-password", "/api/cron", "/api/health"];
const COOKIE = process.env.NODE_ENV === "production" ? "__Host-pb_session" : "pb_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const token = request.cookies.get(COOKIE)?.value;

  if (!token && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + request.nextUrl.search)}` : "";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  if (token && request.method === "GET" && !pathname.startsWith("/api/")) {
    // Perpanjang umur cookie (sliding) hanya saat navigasi halaman, agar tidak
    // bertabrakan dengan Server Action yang menghapus cookie (logout).
    response.cookies.set(COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
