/**
 * Error domain yang aman ditampilkan ke pengguna. Error lain dianggap error teknis
 * dan disembunyikan di balik pesan umum.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = "APP_ERROR",
    public readonly status: number = 400,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Data tidak ditemukan.") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Anda tidak memiliki akses untuk tindakan ini.") {
    super(message, "FORBIDDEN", 403);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sesi berakhir. Silakan masuk kembali.") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Data sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.") {
    super(message, "CONFLICT", 409);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message, "VALIDATION", 422, fieldErrors);
  }
}

/** Pelanggaran aturan bisnis / transisi status yang tidak diizinkan. */
export class RuleError extends AppError {
  constructor(message: string) {
    super(message, "RULE", 422);
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}
