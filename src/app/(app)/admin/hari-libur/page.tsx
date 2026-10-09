import type { Metadata } from "next";
import { CalendarOff } from "lucide-react";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { yearInTz } from "@/server/time";
import { EmptyState, PageHeader, Section } from "@/components/app/ui";
import { QuickTabs } from "@/components/app/list-controls";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateOnly } from "@/lib/format";
import { sp, type SearchParams } from "@/lib/list-params";
import { AddHolidayForm, DeleteHolidayButton } from "./holiday-client";

export const metadata: Metadata = { title: "Hari Libur" };

const WEEKDAY = new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "UTC" });

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const params = await searchParams;
  const current = yearInTz();
  const year = Number(sp(params, "tahun")) || current;
  const rows = await db.holiday.findMany({
    where: { date: { gte: new Date(`${year}-01-01T00:00:00Z`), lt: new Date(`${year + 1}-01-01T00:00:00Z`) } },
    orderBy: { date: "asc" },
  });
  return (
    <>
      <PageHeader
        title="Hari Libur"
        description="Libur nasional & cuti bersama tidak dihitung sebagai jam kerja aktif (tenggat persetujuan dan laporan durasi)."
      />
      <QuickTabs param="tahun" tabs={[current, current + 1, current - 1].map((y) => ({ value: String(y), label: String(y) }))} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Section title={`Hari libur ${year}`} description={`${rows.length} hari`}>
          {rows.length === 0 ? (
            <EmptyState icon={CalendarOff} title="Belum ada hari libur" description="Tambahkan dari SKB libur nasional & cuti bersama tahun berjalan." className="border-0 py-6" />
          ) : (
            <ul className="divide-y">
              {rows.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm">
                    <span className="tabular inline-block w-28 font-medium">{formatDateOnly(h.date)}</span>
                    <span className="mr-2 inline-block w-16 text-muted-foreground capitalize">{WEEKDAY.format(h.date)}</span>
                    {h.name}
                  </span>
                  <DeleteHolidayButton id={h.id} label={h.name} />
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Tambah hari libur">
          <AddHolidayForm defaultYear={year} />
        </Section>
      </div>
    </>
  );
}
