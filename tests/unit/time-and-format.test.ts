import { describe, expect, it } from "vitest";
import { addWorkingHours, dateKeyInTz, workingHoursBetween, zonedMidnight } from "@/server/time";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { deriveStage } from "@/lib/status";
import { checkPasswordPolicy } from "@/server/auth/password";

const cal = { startHour: 8, endHour: 17, workDays: [1, 2, 3, 4, 5], holidays: new Set<string>(), timeZone: "Asia/Makassar" };

describe("waktu kerja (WITA)", () => {
  it("menghitung jam kerja dalam satu hari", () => {
    // Jumat 9 Okt 2026 09:00 → 12:00 WITA
    const start = new Date("2026-10-09T01:00:00Z");
    const end = new Date("2026-10-09T04:00:00Z");
    expect(workingHoursBetween(start, end, cal)).toBe(3);
  });

  it("melewati akhir pekan dan hari libur", () => {
    // Jumat 16:00 WITA → Selasa 09:00 WITA, Senin libur
    const start = new Date("2026-10-09T08:00:00Z");
    const end = new Date("2026-10-13T01:00:00Z");
    expect(workingHoursBetween(start, end, cal)).toBe(1 + 9 + 1);
    expect(workingHoursBetween(start, end, { ...cal, holidays: new Set(["2026-10-12"]) })).toBe(1 + 1);
  });

  it("tanggal lokal & tengah malam zona waktu", () => {
    expect(dateKeyInTz(new Date("2026-10-09T17:30:00Z"), "Asia/Makassar")).toBe("2026-10-10");
    expect(zonedMidnight("2026-01-01", "Asia/Makassar").toISOString()).toBe("2025-12-31T16:00:00.000Z");
  });
});

describe("format & status", () => {
  it("format Rupiah dan tanggal", () => {
    expect(formatCurrency(1250000)).toBe("Rp 1.250.000");
    expect(formatDateOnly(new Date("2026-10-09T00:00:00Z"))).toBe("9 Okt 2026");
  });

  it("tahap pemohon diturunkan dari status", () => {
    expect(deriveStage("DRAFT")).toBe("draft");
    expect(deriveStage("REVISION_REQUIRED")).toBe("approval");
    expect(deriveStage("IN_PROCUREMENT", ["DRAFT"])).toBe("procurement");
    expect(deriveStage("IN_PROCUREMENT", ["ORDERED"])).toBe("delivery");
    expect(deriveStage("AWAITING_CONFIRMATION")).toBe("handover");
    expect(deriveStage("COMPLETED")).toBe("done");
  });

  it("kebijakan password", () => {
    expect(checkPasswordPolicy("pendek1")).toMatch(/minimal 8/);
    expect(checkPasswordPolicy("tanpaangka")).toMatch(/huruf dan angka/);
    expect(checkPasswordPolicy("budi12345", { username: "budi" })).toMatch(/username/);
    expect(checkPasswordPolicy("Rahasia123")).toBeNull();
  });
});

describe("addWorkingHours", () => {
  const cal = { startHour: 8, endHour: 17, workDays: [1, 2, 3, 4, 5], holidays: new Set<string>(["2026-10-12"]), timeZone: "Asia/Makassar" };
  // Jumat 9 Okt 2026 15:00 WITA = 07:00Z
  const friday3pm = new Date("2026-10-09T07:00:00Z");

  it("melewati akhir pekan dan hari libur", () => {
    // Sisa Jumat 2 jam, Senin 12 Okt libur, Selasa 08:00 + 2 jam = 10:00 WITA (02:00Z)
    expect(addWorkingHours(friday3pm, 4, cal).toISOString()).toBe("2026-10-13T02:00:00.000Z");
  });

  it("konsisten dengan workingHoursBetween", () => {
    const due = addWorkingHours(friday3pm, 48, cal);
    expect(workingHoursBetween(friday3pm, due, cal)).toBe(48);
  });

  it("mulai di luar jam kerja dihitung dari jam kerja berikutnya", () => {
    // Kamis 8 Okt 20:00 WITA → Jumat 08:00 + 1 jam = 09:00 WITA (01:00Z)
    expect(addWorkingHours(new Date("2026-10-08T12:00:00Z"), 1, cal).toISOString()).toBe("2026-10-09T01:00:00.000Z");
  });
});
