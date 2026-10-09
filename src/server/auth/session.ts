import { createHash, randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { loadAuthUser, type AuthUser } from "@/server/auth/user";

export const SESSION_TTL_DAYS = 14;
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const RENEW_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 7;
const LAST_SEEN_THROTTLE_MS = 1000 * 60 * 5;

export function sessionCookieName(): string {
  // __Host- memaksa Secure + Path=/ + tanpa Domain (hanya di HTTPS / production).
  return process.env.NODE_ENV === "production" ? "__Host-pb_session" : "pb_session";
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt,
      ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
    },
  });
  return { token, expiresAt };
}

export interface ValidSession {
  sessionId: string;
  user: AuthUser;
}

export async function validateSessionToken(token: string): Promise<ValidSession | null> {
  if (!token || token.length > 100) return null;
  const sessionId = hashToken(token);
  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await db.session.delete({ where: { id: sessionId } }).catch(() => undefined);
    return null;
  }
  const user = await loadAuthUser(db, session.userId);
  if (!user || user.accountStatus !== "ACTIVE") {
    await db.session.delete({ where: { id: sessionId } }).catch(() => undefined);
    return null;
  }
  const needsRenew = session.expiresAt.getTime() - now < RENEW_THRESHOLD_MS;
  const needsTouch = now - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS;
  if (needsRenew || needsTouch) {
    await db.session
      .update({
        where: { id: sessionId },
        data: {
          lastSeenAt: new Date(now),
          ...(needsRenew ? { expiresAt: new Date(now + SESSION_TTL_DAYS * 86_400_000) } : {}),
        },
      })
      .catch(() => undefined);
  }
  return { sessionId, user };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.session.deleteMany({ where: { id: sessionId } });
}

export async function invalidateUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  await db.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
}
