import { APP_TIMEZONE } from "@/lib/format";

/** Bagian tanggal (YYYY-MM-DD) dari waktu tertentu di zona waktu aplikasi. */
export function dateKeyInTz(date: Date = new Date(), timeZone = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function yearInTz(date: Date = new Date()): number {
  return Number(dateKeyInTz(date).slice(0, 4));
}

/** Tanggal "hari ini" sebagai Date tengah malam UTC (cocok untuk kolom DATE). */
export function todayDateOnly(): Date {
  return dateOnly(dateKeyInTz());
}

/** "2026-10-09" -> Date(2026-10-09T00:00:00Z) */
export function dateOnly(value: string): Date {
  const d = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Tanggal tidak valid: ${value}`);
  return d;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

/** Offset zona waktu (menit) pada instant tertentu, mis. WITA = +480. */
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60_000);
}

export interface WorkCalendar {
  /** Jam mulai kerja (0-23) */
  startHour: number;
  /** Jam selesai kerja (1-24) */
  endHour: number;
  /** Hari kerja: 1 = Senin ... 7 = Minggu */
  workDays: number[];
  /** Tanggal libur YYYY-MM-DD */
  holidays: Set<string>;
  timeZone?: string;
}

/**
 * Durasi jam kerja aktif antara dua instant (dalam jam), memperhitungkan
 * jam kerja, hari kerja, dan hari libur pada zona waktu aplikasi.
 */
export function workingHoursBetween(start: Date, end: Date, cal: WorkCalendar): number {
  if (end <= start) return 0;
  const tz = cal.timeZone ?? APP_TIMEZONE;
  let total = 0;
  // Iterasi per hari kalender lokal.
  let cursorKey = dateKeyInTz(start, tz);
  const endKey = dateKeyInTz(end, tz);
  for (let guard = 0; guard < 3660; guard++) {
    const dayUtc = dateOnly(cursorKey);
    const weekday = ((dayUtc.getUTCDay() + 6) % 7) + 1; // 1=Senin
    if (cal.workDays.includes(weekday) && !cal.holidays.has(cursorKey)) {
      const offset = tzOffsetMinutes(dayUtc, tz);
      const workStart = new Date(dayUtc.getTime() + cal.startHour * 3_600_000 - offset * 60_000);
      const workEnd = new Date(dayUtc.getTime() + cal.endHour * 3_600_000 - offset * 60_000);
      const s = Math.max(workStart.getTime(), start.getTime());
      const e = Math.min(workEnd.getTime(), end.getTime());
      if (e > s) total += (e - s) / 3_600_000;
    }
    if (cursorKey === endKey) break;
    cursorKey = dateKeyInTz(addDays(dayUtc, 1), "UTC");
  }
  return Math.round(total * 100) / 100;
}

/** Instant tengah malam lokal (zona waktu aplikasi) untuk tanggal YYYY-MM-DD. */
export function zonedMidnight(dateKey: string, timeZone = APP_TIMEZONE): Date {
  const utcMidnight = dateOnly(dateKey);
  return new Date(utcMidnight.getTime() - tzOffsetMinutes(utcMidnight, timeZone) * 60_000);
}
