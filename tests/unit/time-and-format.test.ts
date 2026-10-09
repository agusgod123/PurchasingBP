import { describe, expect, it } from "vitest";
import { dateKeyInTz, workingHoursBetween, zonedMidnight } from "@/server/time";
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
