"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FieldHint } from "@/components/app/form-bits";
import { MoneyInput } from "@/components/app/inputs";
import { SearchSelect, type SearchOption } from "@/components/app/search-select";
import { Section } from "@/components/app/ui";
import { useAction } from "@/components/app/use-action";
import { APPROVAL_SUBJECT, APPROVER_TYPE, ROUTING_MODE, STEP_MODE } from "@/lib/status";
import { cn } from "@/lib/utils";
import { deleteRuleAction, rerouteRequestAction, saveRuleAction, setRuleActiveAction } from "../actions";
import { newStep, type ApproverType, type RuleForm, type StepForm } from "./rule-form";

export function RuleActiveSwitch({ id, active }: { id: string; active: boolean }) {
  const act = useAction(setRuleActiveAction);
  return <Switch checked={active} disabled={act.pending} onCheckedChange={(v) => void act.run(id, v)} aria-label="Aktifkan aturan" />;
}

export function RerouteButton({ requestId }: { requestId: string }) {
  const act = useAction(rerouteRequestAction);
  return (
    <Button variant="outline" size="sm" disabled={act.pending} onClick={() => void act.run(requestId)}>
      {act.pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Proses ulang
    </Button>
  );
}

export function RuleEditor({
  id,
  initial,
  departments,
  users,
  roles,
  usedCount,
}: {
  id: string | null;
  initial: RuleForm;
  departments: SearchOption[];
  users: SearchOption[];
  roles: SearchOption[];
  usedCount: number;
}) {
  const router = useRouter();
  const [f, setF] = useState<RuleForm>(initial);
  const save = useAction(saveRuleAction, {
    refresh: false,
    onSuccess: (d) => {
      for (const w of d.warnings) toast.warning(w, { duration: 10000 });
      router.push("/admin/persetujuan");
      router.refresh();
    },
  });
  const del = useAction(deleteRuleAction, { refresh: false, onSuccess: () => router.push("/admin/persetujuan") });
  const fe = save.fieldErrors;
  const setStep = (i: number, patch: Partial<StepForm>) => setF({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, d: -1 | 1) => {
    const steps = [...f.steps];
    [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
    setF({ ...f, steps });
  };
  const submit = () =>
    void save.run(id, {
      ...f,
      description: f.description || null,
      minAmount: f.minAmount || null,
      maxAmount: f.maxAmount || null,
      effectiveFrom: f.effectiveFrom || null,
      effectiveUntil: f.effectiveUntil || null,
      steps: f.steps.map((s) => ({ ...s, dueHours: s.dueHours ? Number(s.dueHours) : null })),
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <Section title="Identitas">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rule-name">Nama aturan *</Label>
              <Input id="rule-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!fe.name} placeholder="mis. Pengajuan s.d. Rp10 juta" />
              <FieldHint error={fe.name} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-code">Kode *</Label>
              <Input
                id="rule-code"
                value={f.code}
                onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/\s+/g, "-") })}
                aria-invalid={!!fe.code}
                placeholder="mis. PENGAJUAN-KECIL"
              />
              <FieldHint error={fe.code} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rule-desc">Catatan / dasar kewenangan</Label>
              <Textarea id="rule-desc" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="mis. SK Direksi No. ... tentang batas kewenangan" />
            </div>
          </div>
        </Section>

        <Section title="Berlaku untuk" description="Kosongkan kondisi agar berlaku umum. Aturan dengan prioritas lebih tinggi dipilih lebih dulu.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Jenis transaksi</Label>
              <Select value={f.subjectType} onValueChange={(v) => setF({ ...f, subjectType: v as RuleForm["subjectType"] })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(APPROVAL_SUBJECT).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bagian pemohon</Label>
              <SearchSelect value={f.departmentId} options={departments} placeholder="Semua bagian" onChange={(v) => setF({ ...f, departmentId: v })} />
            </div>
            <div className="space-y-1.5">
              <Label>Nilai minimal</Label>
              <MoneyInput value={f.minAmount} onValueChange={(v) => setF({ ...f, minAmount: v })} placeholder="0" aria-invalid={!!fe.minAmount} />
              <FieldHint error={fe.minAmount} />
            </div>
            <div className="space-y-1.5">
              <Label>Nilai maksimal</Label>
              <MoneyInput value={f.maxAmount} onValueChange={(v) => setF({ ...f, maxAmount: v })} placeholder="tanpa batas" aria-invalid={!!fe.maxAmount} />
              <FieldHint error={fe.maxAmount} />
            </div>
            <div className="space-y-1.5">
              <Label>Jenis permintaan</Label>
              <Select value={f.requestType ?? "all"} onValueChange={(v) => setF({ ...f, requestType: v === "all" ? null : (v as "GOODS" | "SERVICE") })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Barang & jasa</SelectItem>
                  <SelectItem value="GOODS">Barang</SelectItem>
                  <SelectItem value="SERVICE">Jasa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-prio">Prioritas aturan</Label>
              <Input id="rule-prio" type="number" min={0} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} />
              <FieldHint error={fe.priority} hint="Angka lebih besar menang jika beberapa aturan cocok." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-from">Berlaku mulai</Label>
              <Input id="rule-from" type="date" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-until">Berlaku sampai</Label>
              <Input id="rule-until" type="date" value={f.effectiveUntil} onChange={(e) => setF({ ...f, effectiveUntil: e.target.value })} aria-invalid={!!fe.effectiveUntil} />
              <FieldHint error={fe.effectiveUntil} hint="Kosongkan jika tidak berakhir." />
            </div>
          </div>
        </Section>

        <Section title="Tahap persetujuan" description="Pemohon/pemrakarsa otomatis dikecualikan dari approver (pemisahan tugas).">
          <div className="mb-4 space-y-1.5">
            <Label>Urutan</Label>
            <RadioGroup value={f.routingMode} onValueChange={(v) => setF({ ...f, routingMode: v as RuleForm["routingMode"] })} className="grid gap-2 sm:grid-cols-2">
              {Object.entries(ROUTING_MODE).map(([k, v]) => (
                <label key={k} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3", f.routingMode === k && "border-primary bg-primary/[0.04]")}>
                  <RadioGroupItem value={k} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">{v.label}</span>
                    <span className="block text-[13px] text-muted-foreground">{v.description}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>
          <ol className="space-y-3">
            {f.steps.map((s, i) => (
              <li key={i} className="rounded-lg border p-3">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                  <Input value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} aria-label="Nama tahap" aria-invalid={!!fe[`steps.${i}.name`]} className="h-8" />
                  <Button variant="ghost" size="icon" className="size-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Naikkan">
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8" disabled={i === f.steps.length - 1} onClick={() => move(i, 1)} aria-label="Turunkan">
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8" disabled={f.steps.length === 1} onClick={() => setF({ ...f, steps: f.steps.filter((_, j) => j !== i) })} aria-label="Hapus tahap">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Approver</Label>
                    <Select value={s.approverType} onValueChange={(v) => setStep(i, { approverType: v as ApproverType })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(APPROVER_TYPE).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {s.approverType === "USER" && (
                    <div className="space-y-1.5">
                      <Label className="text-[13px]">Pengguna</Label>
                      <SearchSelect value={s.approverUserId} options={users} placeholder="Pilih pengguna" onChange={(v) => setStep(i, { approverUserId: v })} invalid={!!fe[`steps.${i}.approverUserId`]} />
                      <FieldHint error={fe[`steps.${i}.approverUserId`]} />
                    </div>
                  )}
                  {s.approverType === "ROLE" && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-[13px]">Peran</Label>
                        <SearchSelect value={s.approverRoleId} options={roles} placeholder="Pilih peran" onChange={(v) => setStep(i, { approverRoleId: v })} invalid={!!fe[`steps.${i}.approverRoleId`]} />
                        <FieldHint error={fe[`steps.${i}.approverRoleId`]} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[13px]">Pemegang peran dari</Label>
                        <Select value={s.roleScope} onValueChange={(v) => setStep(i, { roleScope: v as StepForm["roleScope"] })}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ANY_DEPARTMENT">Semua bagian</SelectItem>
                            <SelectItem value="REQUESTER_DEPARTMENT">Bagian pemohon saja</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[13px]">Jika lebih dari satu orang</Label>
                        <Select value={s.approvalMode} onValueChange={(v) => setStep(i, { approvalMode: v as StepForm["approvalMode"] })}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STEP_MODE).map(([k, v]) => (
                              <SelectItem key={k} value={k}>
                                {v.label} — {v.description}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Kapan tahap ini berlaku</Label>
                    <Select value={s.condition} onValueChange={(v) => setStep(i, { condition: v as StepForm["condition"] })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALWAYS">Selalu</SelectItem>
                        <SelectItem value="OVER_BUDGET">Hanya jika melebihi anggaran bagian</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Tenggat (jam)</Label>
                    <Input type="number" min={1} value={s.dueHours} placeholder="ikuti pengaturan" onChange={(e) => setStep(i, { dueHours: e.target.value })} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <FieldHint error={fe.steps} />
          <Button variant="outline" size="sm" className="mt-3" disabled={f.steps.length >= 10} onClick={() => setF({ ...f, steps: [...f.steps, newStep(f.steps.length + 1)] })}>
            <Plus className="size-4" /> Tambah tahap
          </Button>
        </Section>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Section title="Simpan">
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">Aktif</span>
                <span className="block text-[13px] text-muted-foreground">Dipakai untuk transaksi baru.</span>
              </span>
              <Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} />
            </label>
            <p className="text-[13px] text-muted-foreground">Perubahan tidak memengaruhi persetujuan yang sedang berjalan — approver sudah dicatat saat proses dimulai.</p>
            <Button className="w-full" disabled={save.pending} onClick={submit}>
              {save.pending && <Loader2 className="size-4 animate-spin" />} Simpan aturan
            </Button>
            {id && (
              <Button
                variant="ghost"
                className="w-full text-destructive hover:text-destructive"
                disabled={del.pending || usedCount > 0}
                title={usedCount > 0 ? "Sudah dipakai; nonaktifkan saja" : undefined}
                onClick={() => {
                  if (confirm("Hapus aturan ini?")) void del.run(id);
                }}
              >
                <Trash2 className="size-4" /> {usedCount > 0 ? `Dipakai ${usedCount}× — tidak dapat dihapus` : "Hapus aturan"}
              </Button>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
