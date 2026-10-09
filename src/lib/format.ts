// Formatter yang aman dipakai di server maupun client.

export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Makassar";

type Numeric = number | string | { toString(): string } | null | undefined;

function toNumber(value: Numeric): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

const currencyFmt = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Rp 1.250.000 */
export function formatCurrency(value: Numeric): string {
  return currencyFmt.format(toNumber(value)).replace(/ /g, " ");
}

const compactFmt = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

/** Rp 1,3 jt */
export function formatCurrencyCompact(value: Numeric): string {
  return `Rp ${compactFmt.format(toNumber(value))}`;
}

const qtyFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });

export function formatQty(value: Numeric): string {
  return qtyFmt.format(toNumber(value));
}

export function formatNumber(value: Numeric): string {
  return new Intl.NumberFormat("id-ID").format(toNumber(value));
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: APP_TIMEZONE,
});

const dateOnlyFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dateTimeFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: APP_TIMEZONE,
});

/** Untuk kolom TIMESTAMPTZ: 9 Okt 2026 (zona waktu aplikasi). */
export function formatDate(value: Date | string | null | undefined, fallback = "—"): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : fallback;
}

/** Untuk kolom DATE (tanpa jam): disimpan sebagai tengah malam UTC. */
export function formatDateOnly(value: Date | string | null | undefined, fallback = "—"): string {
  const d = toDate(value);
  return d ? dateOnlyFmt.format(d) : fallback;
}

export function formatDateTime(value: Date | string | null | undefined, fallback = "—"): string {
  const d = toDate(value);
  return d ? `${dateTimeFmt.format(d).replace(".", ":")}` : fallback;
}

const rtf = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

export function formatRelative(value: Date | string | null | undefined, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return "—";
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return "baru saja";
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  return formatDate(d);
}

/** YYYY-MM-DD untuk input type="date" dari kolom DATE. */
export function toDateInputValue(value: Date | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
