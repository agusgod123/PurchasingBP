"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FieldHint } from "@/components/app/form-bits";
import { SearchSelect, type SearchOption } from "@/components/app/search-select";
import { Section, StatCard } from "@/components/app/ui";
import { useAction } from "@/components/app/use-action";
import { importEmployeesAction, saveDepartmentAction, saveEmployeeAction } from "../actions";

interface DepartmentForm {
  id?: string;
  code: string;
  name: string;
  parentId: string | null;
  headUserId: string | null;
  isActive: boolean;
}

export function DepartmentDialog({ department, departments, users }: { department?: DepartmentForm; departments: SearchOption[]; users: SearchOption[] }) {
  const empty: DepartmentForm = { code: "", name: "", parentId: null, headUserId: null, isActive: true };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<DepartmentForm>(department ?? empty);
  const save = useAction(saveDepartmentAction, { onSuccess: () => setOpen(false) });
  const fe = save.fieldErrors;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(department ?? empty);
      }}
    >
      <DialogTrigger asChild>
        {department ? (
          <Button variant="ghost" size="icon" aria-label={`Ubah ${department.name}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" /> Tambah bagian
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{department ? "Ubah bagian" : "Tambah bagian"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-code">Kode *</Label>
              <Input id="d-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} aria-invalid={!!fe.code} />
              <FieldHint error={fe.code} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-name">Nama *</Label>
              <Input id="d-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!fe.name} />
              <FieldHint error={fe.name} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Kepala bagian</Label>
            <SearchSelect value={f.headUserId} options={users} placeholder="Pilih pengguna" onChange={(v) => setF({ ...f, headUserId: v })} />
            <FieldHint hint="Dipakai untuk tahap persetujuan “Kepala bagian”." />
          </div>
          <div className="space-y-1.5">
            <Label>Bagian induk</Label>
            <SearchSelect value={f.parentId} options={departments} placeholder="Tidak ada" onChange={(v) => setF({ ...f, parentId: v })} invalid={!!fe.parentId} />
            <FieldHint error={fe.parentId} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} /> Aktif
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button disabled={save.pending} onClick={() => void save.run(department?.id ?? null, f)}>
            {save.pending && <Loader2 className="size-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EmployeeForm {
  id?: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  phone: string;
  departmentId: string;
  positionName: string;
  supervisorId: string | null;
  employmentStatus: "ACTIVE" | "INACTIVE";
}

export function EmployeeDialog({ employee, departments, supervisors }: { employee?: EmployeeForm; departments: SearchOption[]; supervisors: SearchOption[] }) {
  const empty: EmployeeForm = { employeeNumber: "", fullName: "", email: "", phone: "", departmentId: "", positionName: "", supervisorId: null, employmentStatus: "ACTIVE" };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<EmployeeForm>(employee ?? empty);
  const save = useAction(saveEmployeeAction, { onSuccess: () => setOpen(false) });
  const fe = save.fieldErrors;
  const text = (k: keyof EmployeeForm, label: string, required = false, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={`e-${k}`}>
        {label} {required && "*"}
      </Label>
      <Input id={`e-${k}`} type={type} value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-invalid={!!fe[k]} />
      <FieldHint error={fe[k]} />
    </div>
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(employee ?? empty);
      }}
    >
      <DialogTrigger asChild>
        {employee ? (
          <Button variant="ghost" size="icon" aria-label={`Ubah ${employee.fullName}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button className="h-9">
            <Plus className="size-4" /> Tambah pegawai
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{employee ? "Ubah pegawai" : "Tambah pegawai"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {text("fullName", "Nama lengkap", true)}
          {text("employeeNumber", "Nomor pegawai")}
          {text("email", "Email", false, "email")}
          {text("phone", "Telepon")}
          {text("positionName", "Jabatan")}
          <div className="space-y-1.5">
            <Label>Bagian *</Label>
            <SearchSelect value={f.departmentId || null} options={departments} allowClear={false} placeholder="Pilih bagian" onChange={(v) => setF({ ...f, departmentId: v ?? "" })} invalid={!!fe.departmentId} />
            <FieldHint error={fe.departmentId} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Atasan langsung</Label>
            <SearchSelect value={f.supervisorId} options={supervisors} placeholder="Tidak ada" onChange={(v) => setF({ ...f, supervisorId: v })} invalid={!!fe.supervisorId} />
            <FieldHint error={fe.supervisorId} hint="Dipakai untuk tahap persetujuan “Atasan langsung pemohon”." />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={f.employmentStatus === "ACTIVE"} onCheckedChange={(v) => setF({ ...f, employmentStatus: v ? "ACTIVE" : "INACTIVE" })} /> Masih aktif bekerja
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            disabled={save.pending}
            onClick={() =>
              void save.run(employee?.id ?? null, {
                ...f,
                employeeNumber: f.employeeNumber || null,
                email: f.email || null,
                phone: f.phone || null,
                positionName: f.positionName || null,
              })
            }
          >
            {save.pending && <Loader2 className="size-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ImportResult = Awaited<ReturnType<typeof importEmployeesAction>> extends { ok: true; data: infer D } | { ok: false } ? D : never;

const TEMPLATE = "nomor_pegawai,nama,email,telepon,kode_bagian,jabatan,nomor_atasan,status\nP-001,Contoh Atasan,atasan@kantor.co.id,0811000001,OPS,Kepala Operasional,,AKTIF\nP-002,Contoh Staf,staf@kantor.co.id,0811000002,OPS,Staf Operasional,P-001,AKTIF\n";

export function ImportPanel({ lastImport, departmentCodes }: { lastImport: string | null; departmentCodes: string[] }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const check = useAction(importEmployeesAction, { refresh: false, onSuccess: (d) => setPreview(d) });
  const commit = useAction(importEmployeesAction, {
    onSuccess: () => {
      setPreview(null);
      setCsv(null);
      setFileName("");
    },
  });
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsv(text);
    setPreview(null);
    void check.run(text, false);
  };
  const problems = preview?.rows.filter((r) => r.error) ?? [];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <Section title="Unggah file CSV" description="Kunci pencocokan = nomor pegawai. Baris yang sudah ada diperbarui; yang baru ditambahkan. Tidak ada yang dihapus.">
          <div
            className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void pick(e.dataTransfer.files[0]);
            }}
          >
            <FileUp className="size-8 text-muted-foreground" />
            <div className="text-sm">
              {fileName ? <span className="font-medium">{fileName}</span> : "Seret file CSV ke sini, atau"}
            </div>
            <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            <Button variant="outline" onClick={() => input.current?.click()} disabled={check.pending}>
              {check.pending ? <Loader2 className="size-4 animate-spin" /> : null} {fileName ? "Pilih file lain" : "Pilih file"}
            </Button>
          </div>
        </Section>
        {preview && (
          <Section title="Pratinjau" description="Belum ada yang disimpan. Periksa lalu klik Impor.">
            <div className="mb-4 grid grid-cols-3 gap-3">
              <StatCard label="Baru" value={preview.created} tone="success" />
              <StatCard label="Diperbarui" value={preview.updated} tone="info" />
              <StatCard label="Bermasalah" value={preview.errors} tone={preview.errors ? "danger" : "neutral"} />
            </div>
            {problems.length > 0 ? (
              <>
                <Alert variant="destructive" className="mb-3">
                  <AlertTriangle />
                  <AlertDescription>Perbaiki baris berikut di file sumber lalu unggah ulang.</AlertDescription>
                </Alert>
                <div className="max-h-80 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Baris</TableHead>
                        <TableHead>Pegawai</TableHead>
                        <TableHead>Masalah</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {problems.slice(0, 200).map((r) => (
                        <TableRow key={r.line}>
                          <TableCell className="tabular">{r.line}</TableCell>
                          <TableCell className="text-sm">
                            {r.employeeNumber || "—"} {r.fullName}
                          </TableCell>
                          <TableCell className="text-sm text-destructive">{r.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" /> Semua baris valid.
                </p>
                <Button disabled={commit.pending || !csv} onClick={() => csv && void commit.run(csv, true)}>
                  {commit.pending && <Loader2 className="size-4 animate-spin" />} Impor {preview.created + preview.updated} pegawai
                </Button>
              </div>
            )}
          </Section>
        )}
      </div>
      <Section title="Format file">
        <div className="space-y-3 text-[13px] text-muted-foreground">
          <p>Kolom wajib: <code className="text-foreground">nomor_pegawai</code>, <code className="text-foreground">nama</code>, <code className="text-foreground">kode_bagian</code>.</p>
          <p>
            Opsional: email, telepon, jabatan, <code className="text-foreground">nomor_atasan</code> (nomor pegawai atasan langsung), status (AKTIF / NONAKTIF).
          </p>
          <p>Pemisah koma atau titik koma (ekspor Excel) sama-sama didukung.</p>
          <p>Kode bagian yang dikenal: {departmentCodes.join(", ") || "—"}.</p>
          {lastImport && <p>Impor terakhir: {lastImport}</p>}
          <Button variant="outline" size="sm" asChild>
            <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="template-pegawai.csv">
              <Download className="size-4" /> Unduh template
            </a>
          </Button>
        </div>
      </Section>
    </div>
  );
}
