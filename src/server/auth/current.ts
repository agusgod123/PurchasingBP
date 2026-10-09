import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieName, validateSessionToken, SESSION_COOKIE_MAX_AGE } from "@/server/auth/session";
import { can, type AuthUser } from "@/server/auth/user";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";
import type { PermissionCode } from "@/lib/permissions";
import type { ActorContext } from "@/server/context";

/** Membaca sesi sekali per permintaan (React cache). */
export const getSession = cache(async () => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;
  return validateSessionToken(token);
});

export async function getCurrentUser(): Promise<AuthUser | null> {
  return (await getSession())?.user ?? null;
}

/** Untuk halaman: alihkan ke login jika belum masuk. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/ganti-password");
  return user;
}

/** Untuk halaman yang butuh izin tertentu. */
export async function requirePermission(code: PermissionCode): Promise<AuthUser> {
  const user = await requireUser();
  if (!can(user, code)) redirect("/akses-ditolak");
  return user;
}

export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  };
}

/** Untuk Server Action / Route Handler: lempar error alih-alih redirect. */
export async function getActor(permission?: PermissionCode): Promise<ActorContext> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (permission && !can(user, permission)) throw new ForbiddenError();
  const meta = await requestMeta();
  return { user, ip: meta.ip, userAgent: meta.userAgent };
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(sessionCookieName());
}
