"use client";

import { useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FieldHint } from "@/components/app/form-bits";
import { Section } from "@/components/app/ui";
import { useAction } from "@/components/app/use-action";
import type { Settings } from "@/server/settings-defaults";
import { DOCUMENT_TYPE, REQUEST_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { saveSettingsAction } from "../actions";

const MIME_OPTIONS: Array<[string, string]> = [
  ["application/pdf", "PDF"],
  ["image/jpeg", "JPG"],
  ["image/png", "PNG"],
  ["image/webp", "WebP"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Excel (.xlsx)"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Word (.docx)"],
  ["application/vnd.ms-excel", "Excel lama (.xls)"],
  ["application/msword", "Word lama (.doc)"],
];
const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const CANCELABLE: Array<keyof typeof REQUEST_STATUS> = ["DRAFT", "PENDING_APPROVAL", "REVISION_REQUIRED", "ON_HOLD", "APPROVED"];

function toggle<T>(list: T[], v: T, on: boolean): T[] {
  return on ? [...new Set([...list, v])] : list.filter((x) => x !== v);
}

export function SettingsForm({
  initial,
  descriptions,
  notificationTypes,
}: {
  initial: Settings;
  descriptions: Record<keyof Settings, string>;
  notificationTypes: Record<string, string>;
}) {
  const [s, setS] = useState<Settings>(initial);
  const save = useAction(saveSettingsAction);
  const fe = save.fieldErrors;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const changed = (Object.keys(s) as Array<keyof Settings>).filter((k) => JSON.stringify(s[k]) !== JSON.stringify(initial[k]));
  const num = (k: keyof Settings, label: string, suffix: string, opts: { min?: number; max?: number } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={k}
          type="number"
          className="w-28"
          min={opts.min}
          max={opts.max}
          value={String(s[k])}
          onChange={(e) => set(k, Number(e.target.value) as never)}
          aria-invalid={!!fe[k]}
        />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
      <FieldHint error={fe[k]} hint={descriptions[k]} />
    </div>
  );
  const checks = <K extends keyof Settings>(k: K, options: Array<[string, string]>, cols = "sm:grid-cols-2") => (
    <div className={cn("grid gap-2", cols)}>
      {options.map(([value, label]) => (
        <label key={value} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={(s[k] as string[]).includes(value)}
            onCheckedChange={(c) => set(k, toggle(s[k] as string[], value, !!c) as Settings[K])}
          />
          {label}
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-6 pb-20">
      <Section title="Umum">
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="org">Nama organisasi</Label>
          <Input id="org" value={s["app.organization_name"]} onChange={(e) => set("app.organization_name", e.target.value)} aria-invalid={!!fe["app.organization_name"]} />
          <FieldHint error={fe["app.organization_name"]} hint={descriptions["app.organization_name"]} />
        </div>
      </Section>

      <Section title="Persetujuan" description="SLA resmi masih TBD — angka di bawah dipakai untuk pengingat dan eskalasi, bukan keputusan otomatis.">
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Saat pengajuan direvisi lalu dikirim ulang</Label>
            <RadioGroup value={s["approval.reapproval_policy"]} onValueChange={(v) => set("approval.reapproval_policy", v as Settings["approval.reapproval_policy"])} className="grid gap-2 md:grid-cols-2">
              {[
                ["AFFECTED_ONLY", "Hanya yang terdampak", "Persetujuan sebelumnya dibawa bila aturan sama dan nilai tidak naik."],
                ["FULL", "Ulang semua", "Semua tahap menyetujui kembali dari awal."],
              ].map(([v, t, d]) => (
                <label key={v} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3", s["approval.reapproval_policy"] === v && "border-primary bg-primary/[0.04]")}>
                  <RadioGroupItem value={v} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">{t}</span>
                    <span className="block text-[13px] text-muted-foreground">{d}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {num("approval.default_due_hours", "Tenggat default", "jam kerja", { min: 1 })}
            {num("approval.reminder_interval_hours", "Pengingat setiap", "jam", { min: 1 })}
            {num("approval.escalation_after_hours", "Eskalasi setelah", "jam lewat tenggat", { min: 1 })}
          </div>
        </div>
      </Section>

      <Section title="Kalender kerja" description="Dipakai untuk menghitung jam kerja aktif dan tenggat.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {num("work_calendar.start_hour", "Jam mulai", ":00", { min: 0, max: 23 })}
            {num("work_calendar.end_hour", "Jam selesai", ":00", { min: 1, max: 24 })}
          </div>
          <div className="space-y-2">
            <Label>Hari kerja</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => {
                const on = s["work_calendar.work_days"].includes(i + 1);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("work_calendar.work_days", toggle(s["work_calendar.work_days"], i + 1, !on).sort())}
                    className={cn("rounded-full border px-3 py-1 text-sm transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <FieldHint error={fe["work_calendar.work_days"]} />
          </div>
        </div>
      </Section>

      <Section title="Purchasing & anggaran">
        <div className="grid gap-5 md:grid-cols-2">
          {num("purchasing.stale_after_days", "Tandai perlu ditinjau setelah", "hari tanpa aktivitas", { min: 1 })}
          {num("purchasing.price_tolerance_percent", "Toleransi selisih harga", "%", { min: 0, max: 100 })}
          <label className="flex items-start gap-3 text-sm md:col-span-2">
            <Switch checked={s["budget.warning_enabled"]} onCheckedChange={(v) => set("budget.warning_enabled", v)} className="mt-0.5" />
            <span>
              <span className="block font-medium">Peringatan anggaran</span>
              <span className="block text-[13px] text-muted-foreground">{descriptions["budget.warning_enabled"]}</span>
            </span>
          </label>
        </div>
      </Section>

      <Section title="Dokumen">
        <div className="space-y-5">
          {num("documents.max_file_mb", "Ukuran maksimum per file", "MB", { min: 1, max: 50 })}
          <div className="space-y-2">
            <Label>Jenis file yang boleh diunggah</Label>
            {checks("documents.allowed_mime_types", MIME_OPTIONS, "grid-cols-2 sm:grid-cols-4")}
            <FieldHint error={fe["documents.allowed_mime_types"]} />
          </div>
          <div className="space-y-2">
            <Label>Dokumen yang dapat dilihat pemohon pada transaksinya</Label>
            {checks("documents.requester_visible_types", Object.entries(DOCUMENT_TYPE))}
          </div>
        </div>
      </Section>

      <Section title="Pembatalan oleh pemohon" description={descriptions["request.requester_cancel_statuses"]}>
        {checks("request.requester_cancel_statuses", CANCELABLE.map((k) => [k, REQUEST_STATUS[k].label]), "sm:grid-cols-3")}
      </Section>

      <Section title="Notifikasi email" description="Notifikasi lain tetap muncul di aplikasi. Email penting akun (reset password, aktivasi) selalu dikirim.">
        {checks("notifications.email_types", Object.entries(notificationTypes), "sm:grid-cols-2 lg:grid-cols-3")}
      </Section>

      <div
        className={cn(
          "fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg transition-all md:left-[calc(var(--sidebar-width,16rem)+1rem)]",
          changed.length ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
        aria-hidden={!changed.length}
      >
        <span className="text-sm">{changed.length} pengaturan diubah</span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setS(initial)} disabled={save.pending}>
            <Undo2 className="size-4" /> Batalkan
          </Button>
          <Button disabled={save.pending} onClick={() => void save.run(Object.fromEntries(changed.map((k) => [k, s[k]])) as Partial<Settings>)}>
            {save.pending && <Loader2 className="size-4 animate-spin" />} Simpan
          </Button>
        </div>
      </div>
    </div>
  );
}
