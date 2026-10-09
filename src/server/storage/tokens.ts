import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const value = process.env.SESSION_SECRET || process.env.CRON_SECRET;
  if (!value && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET wajib diisi di production");
  return value || "dev-insecure-secret";
}

/** Token unggah untuk driver lokal: HMAC(documentId:expires). */
export function signUploadToken(documentId: string, expiresAt: number): string {
  const sig = createHmac("sha256", secret()).update(`${documentId}:${expiresAt}`).digest("base64url");
  return `${expiresAt}.${sig}`;
}

export function verifyUploadToken(documentId: string, token: string): boolean {
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now()) return false;
  const expected = createHmac("sha256", secret()).update(`${documentId}:${exp}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
