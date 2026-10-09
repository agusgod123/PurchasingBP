import "server-only";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import type { WorkCalendar } from "@/server/time";

/** Kalender kerja dari Pengaturan + tabel hari libur (untuk durasi kerja aktif & jatuh tempo). */
export async function loadWorkCalendar(): Promise<WorkCalendar> {
  const [settings, holidays] = await Promise.all([getSettings(), db.holiday.findMany({ select: { date: true } })]);
  return {
    startHour: settings["work_calendar.start_hour"],
    endHour: settings["work_calendar.end_hour"],
    workDays: settings["work_calendar.work_days"],
    holidays: new Set(holidays.map((h) => h.date.toISOString().slice(0, 10))),
  };
}
