import { hash, verify } from "@node-rs/argon2";

// Argon2id (default @node-rs/argon2) dengan parameter minimum rekomendasi OWASP.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/** Menyamakan waktu respons saat akun tidak ditemukan (mitigasi user enumeration). */
export async function verifyDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(await dummyHash, password);
}

/** Mengembalikan pesan kesalahan, atau null jika password memenuhi kebijakan. */
export function checkPasswordPolicy(password: string, context: { username?: string; email?: string } = {}): string | null {
  if (password.length < 8) return "Password minimal 8 karakter.";
  if (password.length > 128) return "Password maksimal 128 karakter.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Password harus mengandung huruf dan angka.";
  const lower = password.toLowerCase();
  if (context.username && lower.includes(context.username.toLowerCase())) return "Password tidak boleh memuat username.";
  if (context.email && lower === context.email.toLowerCase()) return "Password tidak boleh sama dengan email.";
  return null;
}
