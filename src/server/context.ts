import type { AuthUser } from "@/server/auth/user";

/** Konteks pelaku yang diteruskan ke setiap service domain. */
export interface ActorContext {
  user: AuthUser;
  ip?: string | null;
  userAgent?: string | null;
}
