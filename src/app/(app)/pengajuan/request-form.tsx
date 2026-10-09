"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  CloudOff,
  Copy,
  HardDrive,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
  Cloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MoneyInput, QtyInput } from "@/components/app/inputs";
import { DocumentsPanel, type DocItem } from "@/components/app/documents-panel";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { requestSubmitShape } from "@/lib/schemas/request";
import { cn } from "@/lib/utils";
import { saveDraftAction, submitRequestAction } from "./actions";
import { blankItem } from "./form-shared";

export interface ItemDraft {
  key: string;
  id?: string;
  catalogItemId?: string | null;
  categoryId?: string | null;
  itemName: string;
  specification: string;
  quantity: string;
  unitName: string;
  estimatedUnitPrice: string;
  reason: string;
  neededDate: string;
}

export interface FormDataShape {
  title: string;
  generalReason: string;
  requestedPriority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  neededDate: string;
  items: ItemDraft[];
}

interface CatalogEntry {
  id: string;
  name: string;
  description: string | null;
  unitName: string;
  defaultEstimatedPrice: string | null;
  categoryId: string;
  code: string | null;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "local"; at: number }
  | { kind: "saving" }
  | { kind: "server"; at: number }
  | { kind: "error"; message: string; at?: number };

const PRIORITIES = [
  { value: "LOW", label: "Rendah" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "Tinggi" },
  { value: "URGENT", label: "Mendesak" },
] as const;

const UNITS = ["unit", "buah", "pcs", "set", "paket", "rim", "box", "lusin", "liter", "kg", "meter", "roll", "pasang", "lembar"];

let keySeq = 0;
const newKey = () => `k${Date.now().toString(36)}${(keySeq++).toString(36)}`;
/** Dipanggil hanya dari event handler / initializer, bukan saat render. */
const nowMs = () => Date.now();

function emptyItem(): ItemDraft {
  return blankItem(newKey());
}

function lineTotal(i: ItemDraft) {
  return (Number(i.quantity) || 0) * (Number(i.estimatedUnitPrice) || 0);
}

function toPayload(d: FormDataShape) {
  return {
    title: d.title,
    generalReason: d.generalReason,
    requestedPriority: d.requestedPriority,
    neededDate: d.neededDate || null,
    items: d.items.map((i) => ({
      id: i.id,
      catalogItemId: i.catalogItemId ?? null,
      categoryId: i.categoryId ?? null,
      itemName: i.itemName.trim(),
      specification: i.specification.trim(),
      quantity: Number(i.quantity) > 0 ? i.quantity : "1",
      unitName: i.unitName.trim() || "unit",
      estimatedUnitPrice: i.estimatedUnitPrice || "0",
      reason: i.reason || null,
      neededDate: i.neededDate || null,
    })),
  };
}

const storageKey = (id?: string) => `pb:draft:${id ?? "new"}`;

function readLocal(id?: string): { data: FormDataShape; at: number } | null {
  try {
    const raw = localStorage.getItem(storageKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocal(id: string | undefined, data: FormDataShape) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify({ data, at: Date.now() }));
  } catch {
    /* penyimpanan perangkat tidak tersedia */
  }
}

function clearLocal(id?: string) {
  try {
    localStorage.removeItem(storageKey(id));
    if (id) localStorage.removeItem(storageKey());
  } catch {
    /* abaikan */
  }
}

export function RequestForm({
  initial,
  requestId: initialId,
  lockVersion: initialLock,
  serverUpdatedAt,
  isRevision,
  categories,
  catalog,
  documents,
  attachmentRequired,
  budgetRemaining,
  departmentName,
}: {
  initial: FormDataShape;
  requestId?: string;
  lockVersion?: number;
  serverUpdatedAt?: string;
  isRevision?: boolean;
  categories: Array<{ id: string; name: string }>;
  catalog: CatalogEntry[];
  documents: DocItem[];
  attachmentRequired: boolean;
  budgetRemaining: string | null;
  departmentName: string | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<FormDataShape>(initial);
  const [requestId, setRequestId] = useState(initialId);
  const lockRef = useRef(initialLock ?? 0);
  const [save, setSave] = useState<SaveState>(() => ({ kind: initialId ? "server" : "idle", at: nowMs() }) as SaveState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [restore, setRestore] = useState<{ data: FormDataShape; at: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [changeSummary, setChangeSummary] = useState("");
  const dirtyRef = useRef(false);
  const savingRef = useRef<Promise<boolean> | null>(null);
  const createKey = useRef(crypto.randomUUID());
  const submitKey = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tawarkan pemulihan isian lokal yang lebih baru dari data server.
  useEffect(() => {
    const local = readLocal(initialId);
    const serverTime = serverUpdatedAt ? new Date(serverUpdatedAt).getTime() : 0;
    // localStorage hanya tersedia di browser, jadi dibaca setelah mount (bukan saat render) agar hidrasi konsisten.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (local && local.at > serverTime + 1000 && JSON.stringify(local.data) !== JSON.stringify(initial)) setRestore(local);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveToServer = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) await savingRef.current;
    if (!dirtyRef.current && requestId) return true;
    const snapshot = data;
    const run = (async () => {
      setSave({ kind: "saving" });
      try {
        const res = await saveDraftAction({
          id: requestId,
          lockVersion: lockRef.current,
          data: toPayload(snapshot),
          idempotencyKey: requestId ? undefined : createKey.current,
        });
        if (!res.ok) {
          setSave({ kind: "error", message: res.error });
          if (res.fieldErrors) setErrors(res.fieldErrors);
          return false;
        }
        lockRef.current = res.data.lockVersion;
        // Tautkan id item dari server ke baris di formulir agar penyimpanan berikutnya memperbarui, bukan membuat ulang.
        const idByKey = new Map(snapshot.items.map((it, i) => [it.key, res.data.itemIds[i]]));
        setData((d) => ({ ...d, items: d.items.map((it) => (idByKey.get(it.key) ? { ...it, id: idByKey.get(it.key) } : it)) }));
        dirtyRef.current = false;
        if (!requestId) {
          setRequestId(res.data.id);
          clearLocal(undefined);
          window.history.replaceState(null, "", `/pengajuan/${res.data.id}/edit`);
        }
        writeLocal(res.data.id, snapshot);
        setSave({ kind: "server", at: Date.now() });
        return true;
      } catch {
        setSave({ kind: "error", message: "Tidak dapat terhubung ke server. Isian tersimpan di perangkat ini." });
        return false;
      } finally {
        savingRef.current = null;
      }
    })();
    savingRef.current = run;
    return run;
  }, [data, requestId]);

  // Simpan otomatis: ke perangkat segera, ke server setelah jeda mengetik.
  const update = (patch: Partial<FormDataShape>) => {
    setData((d) => {
      const next = { ...d, ...patch };
      writeLocal(requestId, next);
      return next;
    });
    dirtyRef.current = true;
    setSave({ kind: "local", at: nowMs() });
  };

  useEffect(() => {
    if (!dirtyRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    const meaningful = data.title.trim().length > 0 || data.items.some((i) => i.itemName.trim());
    if (!meaningful) return;
    timer.current = setTimeout(() => void saveToServer(), 3000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [data, saveToServer]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const updateItem = (key: string, patch: Partial<ItemDraft>) =>
    update({ items: data.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) });

  const total = useMemo(() => data.items.reduce((acc, i) => acc + lineTotal(i), 0), [data.items]);
  const overBudget = budgetRemaining !== null && total > Number(budgetRemaining);

  const checklist = [
    { label: "Judul pengajuan", ok: data.title.trim().length >= 5 },
    { label: "Alasan kebutuhan", ok: data.generalReason.trim().length >= 10 },
    { label: "Tanggal dibutuhkan", ok: !!data.neededDate },
    {
      label: "Minimal satu item lengkap",
      ok: data.items.some((i) => i.itemName.trim() && i.specification.trim() && Number(i.quantity) > 0 && i.unitName.trim()),
    },
    ...(attachmentRequired ? [{ label: "Lampiran pendukung", ok: documents.length > 0 }] : []),
  ];
  const ready = checklist.every((c) => c.ok);

  const submit = async () => {
    const parsed = requestSubmitShape.safeParse(toPayload(data));
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) fe[issue.path.join(".")] ??= issue.message;
      setErrors(fe);
      toast.error("Lengkapi isian yang ditandai terlebih dahulu.");
      return;
    }
    setSubmitting(true);
    try {
      const saved = await saveToServer();
      if (!saved || !requestId) {
        if (!requestId) toast.error("Draf belum tersimpan. Coba lagi.");
        return;
      }
      submitKey.current ??= crypto.randomUUID();
      const res = await submitRequestAction({
        id: requestId,
        lockVersion: lockRef.current,
        changeSummary: changeSummary || undefined,
        idempotencyKey: submitKey.current,
      });
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error);
        submitKey.current = null;
        return;
      }
      clearLocal(requestId);
      dirtyRef.current = false;
      if (res.data.status === "ON_HOLD") {
        toast.warning(`Pengajuan ${res.data.requestNumber} terkirim tetapi ditahan: ${res.data.holdReason ?? "jalur persetujuan belum jelas"}`);
      } else {
        toast.success(`Pengajuan ${res.data.requestNumber} berhasil dikirim.`);
      }
      if (res.data.budgetWarning) toast.warning(res.data.budgetWarning);
      router.push(`/pengajuan/${requestId}`);
      router.refresh();
    } catch {
      toast.error("Koneksi ke server gagal. Isian Anda aman — coba kirim lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  const err = (k: string) => errors[k];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        {restore && (
          <Alert>
            <HardDrive />
            <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>Ada isian yang belum tersimpan di server dari {formatDateTime(new Date(restore.at))}.</span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setData(restore.data);
                    dirtyRef.current = true;
                    setRestore(null);
                    setSave({ kind: "local", at: restore.at });
                  }}
                >
                  Pulihkan
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    clearLocal(initialId);
                    setRestore(null);
                  }}
                >
                  Buang
                </Button>
              </span>
            </AlertDescription>
          </Alert>
        )}

        <section className="rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Informasi pengajuan</h2>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Judul <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={data.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="Contoh: Laptop untuk staf baru tim Operasional"
                aria-invalid={!!err("title")}
                maxLength={255}
              />
              {err("title") && <p className="text-[13px] text-destructive">{err("title")}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">
                Alasan kebutuhan <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reason"
                value={data.generalReason}
                onChange={(e) => update({ generalReason: e.target.value })}
                placeholder="Jelaskan mengapa barang ini dibutuhkan dan dampaknya bila tidak tersedia."
                rows={3}
                aria-invalid={!!err("generalReason")}
              />
              {err("generalReason") && <p className="text-[13px] text-destructive">{err("generalReason")}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              <div className="space-y-2">
                <Label htmlFor="neededDate">
                  Tanggal dibutuhkan <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="neededDate"
                  type="date"
                  value={data.neededDate}
                  onChange={(e) => update({ neededDate: e.target.value })}
                  aria-invalid={!!err("neededDate")}
                />
                {err("neededDate") && <p className="text-[13px] text-destructive">{err("neededDate")}</p>}
              </div>
              <div className="space-y-2">
                <Label>Urgensi yang diusulkan</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={data.requestedPriority}
                  onValueChange={(v) => v && update({ requestedPriority: v as FormDataShape["requestedPriority"] })}
                  className="w-full sm:w-auto"
                >
                  {PRIORITIES.map((p) => (
                    <ToggleGroupItem
                      key={p.value}
                      value={p.value}
                      className="flex-1 px-3 data-[state=on]:border-primary/50 data-[state=on]:bg-primary/10 data-[state=on]:text-primary sm:flex-none"
                    >
                      {p.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <p className="text-xs text-muted-foreground">Prioritas final ditetapkan oleh atasan saat persetujuan.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-[15px] font-semibold">Daftar barang</h2>
              <p className="text-[13px] text-muted-foreground">Pilih dari katalog atau ketik bebas.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => update({ items: [...data.items, emptyItem()] })}>
              <Plus className="size-4" /> Tambah item
            </Button>
          </div>
          <div className="divide-y">
            {data.items.map((item, idx) => (
              <ItemEditor
                key={item.key}
                index={idx}
                item={item}
                categories={categories}
                catalog={catalog}
                errors={errors}
                canRemove={data.items.length > 1}
                onChange={(patch) => updateItem(item.key, patch)}
                onRemove={() => update({ items: data.items.filter((i) => i.key !== item.key) })}
                onDuplicate={() => {
                  const copy = { ...item, key: newKey(), id: undefined };
                  const items = [...data.items];
                  items.splice(idx + 1, 0, copy);
                  update({ items });
                }}
              />
            ))}
          </div>
          {err("items") && <p className="px-5 pb-4 text-[13px] text-destructive">{err("items")}</p>}
          <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3 text-sm sm:px-5">
            <span className="text-muted-foreground">{data.items.length} item</span>
            <span>
              Total estimasi <span className="ml-2 tabular text-base font-semibold">{formatCurrency(total)}</span>
            </span>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="text-[15px] font-semibold">
            Lampiran {attachmentRequired && <span className="text-destructive">*</span>}
          </h2>
          <p className="mb-3 text-[13px] text-muted-foreground">
            Contoh: foto barang rusak, penawaran awal, memo, atau spesifikasi teknis.
          </p>
          {requestId ? (
            <DocumentsPanel parentType="request" parentId={requestId} documents={documents} uploadTypes={["REQUEST_ATTACHMENT", "OTHER"]} />
          ) : (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              Simpan draf terlebih dahulu untuk mulai mengunggah lampiran.
              <Button size="sm" variant="outline" onClick={() => void saveToServer()} disabled={save.kind === "saving"}>
                <Save className="size-4" /> Simpan draf
              </Button>
            </div>
          )}
        </section>

        {isRevision && (
          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <Label htmlFor="changeSummary" className="text-[15px] font-semibold">
              Ringkasan perubahan
            </Label>
            <p className="mb-3 text-[13px] text-muted-foreground">Jelaskan apa yang diubah dibanding versi sebelumnya.</p>
            <Textarea id="changeSummary" rows={2} value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} />
          </section>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border bg-card p-4">
          <SaveIndicator state={save} onRetry={() => void saveToServer()} />
          <div className="mt-4 border-t pt-4">
            <div className="text-[13px] text-muted-foreground">Total estimasi</div>
            <div className="tabular text-2xl font-semibold">{formatCurrency(total)}</div>
            {departmentName && <div className="text-xs text-muted-foreground">Bagian {departmentName}</div>}
            {budgetRemaining !== null && (
              <div className={cn("mt-2 text-xs", overBudget ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                {overBudget && <AlertTriangle className="mr-1 inline size-3.5" />}
                Sisa anggaran bagian: {formatCurrency(budgetRemaining)}
                {overBudget && ". Melebihi anggaran — persetujuan tambahan dapat diperlukan."}
              </div>
            )}
          </div>
          <ul className="mt-4 space-y-2 border-t pt-4">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-sm">
                {c.ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <CircleDashed className="size-4 text-muted-foreground" />}
                <span className={cn(!c.ok && "text-muted-foreground")}>{c.label}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-2">
            <Button onClick={submit} disabled={submitting || !ready} className="h-10">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {isRevision ? "Kirim ulang pengajuan" : "Kirim pengajuan"}
            </Button>
            <Button variant="outline" onClick={() => void saveToServer()} disabled={save.kind === "saving"}>
              <Save className="size-4" /> Simpan draf
            </Button>
          </div>
          {!ready && <p className="mt-2 text-xs text-muted-foreground">Lengkapi daftar di atas untuk mengirim.</p>}
        </div>
      </aside>
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const time = (at?: number) => (at ? new Date(at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "");
  switch (state.kind) {
    case "saving":
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Menyimpan ke server…
        </p>
      );
    case "server":
      return (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <Cloud className="size-4" /> Draf tersimpan di server {time(state.at)}
        </p>
      );
    case "local":
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <HardDrive className="size-4" /> Tersimpan di perangkat {time(state.at)}
        </p>
      );
    case "error":
      return (
        <div className="space-y-2">
          <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
            <CloudOff className="mt-0.5 size-4 shrink-0" /> {state.message}
          </p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Coba simpan lagi
          </Button>
        </div>
      );
    default:
      return <p className="text-sm text-muted-foreground">Belum disimpan</p>;
  }
}

function ItemEditor({
  index,
  item,
  categories,
  catalog,
  errors,
  canRemove,
  onChange,
  onRemove,
  onDuplicate,
}: {
  index: number;
  item: ItemDraft;
  categories: Array<{ id: string; name: string }>;
  catalog: CatalogEntry[];
  errors: Record<string, string>;
  canRemove: boolean;
  onChange: (patch: Partial<ItemDraft>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const fid = `item-${item.key}`;
  const q = item.itemName.trim().toLowerCase();
  const suggestions = useMemo(
    () =>
      q.length >= 2
        ? catalog.filter((c) => c.name.toLowerCase().includes(q) || c.code?.toLowerCase().includes(q)).slice(0, 6)
        : [],
    [catalog, q],
  );
  const e = (field: string) => errors[`items.${index}.${field}`];
  const subtotal = lineTotal(item);

  return (
    <div className="space-y-3 px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {index + 1}
        </span>
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_200px]">
          <div className="relative space-y-1.5">
            <Label className="text-[13px]" htmlFor={`${fid}-name`}>
              Nama barang *
            </Label>
            <Input
              id={`${fid}-name`}
              value={item.itemName}
              onChange={(ev) => onChange({ itemName: ev.target.value, catalogItemId: null })}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              placeholder="Ketik nama barang…"
              aria-invalid={!!e("itemName")}
              autoComplete="off"
            />
            {focused && suggestions.length > 0 && !item.catalogItemId && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg">
                <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Dari katalog</div>
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => {
                      onChange({
                        catalogItemId: s.id,
                        itemName: s.name,
                        specification: item.specification || s.description || "",
                        unitName: s.unitName,
                        estimatedUnitPrice: item.estimatedUnitPrice || (s.defaultEstimatedPrice ? String(Math.round(Number(s.defaultEstimatedPrice))) : ""),
                        categoryId: s.categoryId,
                      });
                      setFocused(false);
                    }}
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {s.defaultEstimatedPrice ? `${formatCurrency(s.defaultEstimatedPrice)} / ${s.unitName}` : s.unitName}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {e("itemName") && <p className="text-[13px] text-destructive">{e("itemName")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]" htmlFor={`${fid}-cat`}>
              Kategori
            </Label>
            <Select value={item.categoryId ?? undefined} onValueChange={(v) => onChange({ categoryId: v })}>
              <SelectTrigger className="w-full" id={`${fid}-cat`}>
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[13px]" htmlFor={`${fid}-spec`}>
              Spesifikasi *
            </Label>
            <Textarea
              id={`${fid}-spec`}
              value={item.specification}
              onChange={(ev) => onChange({ specification: ev.target.value })}
              placeholder="Merek/tipe, ukuran, warna, atau standar yang dibutuhkan"
              rows={2}
              aria-invalid={!!e("specification")}
            />
            {e("specification") && <p className="text-[13px] text-destructive">{e("specification")}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-[110px_140px_1fr_auto]">
            <div className="space-y-1.5">
              <Label className="text-[13px]" htmlFor={`${fid}-qty`}>
                Jumlah *
              </Label>
              <QtyInput id={`${fid}-qty`} value={item.quantity} onValueChange={(v) => onChange({ quantity: v })} aria-invalid={!!e("quantity")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]" htmlFor={`${fid}-unit`}>
                Satuan *
              </Label>
              <Input id={`${fid}-unit`} value={item.unitName} onChange={(ev) => onChange({ unitName: ev.target.value })} list="units" aria-invalid={!!e("unitName")} />
            </div>
            <div className="col-span-2 space-y-1.5 sm:col-span-1">
              <Label className="text-[13px]" htmlFor={`${fid}-price`}>
                Estimasi harga / satuan
              </Label>
              <MoneyInput id={`${fid}-price`} value={item.estimatedUnitPrice} onValueChange={(v) => onChange({ estimatedUnitPrice: v })} placeholder="0" />
            </div>
            <div className="col-span-2 flex items-end justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end sm:justify-end">
              <span className="text-[13px] text-muted-foreground sm:hidden">Subtotal</span>
              <span className="tabular pb-2 text-sm font-semibold">{formatCurrency(subtotal)}</span>
            </div>
          </div>
          {(e("quantity") || e("unitName") || e("estimatedUnitPrice")) && (
            <p className="text-[13px] text-destructive sm:col-span-2">{e("quantity") ?? e("unitName") ?? e("estimatedUnitPrice")}</p>
          )}
          <Collapsible className="sm:col-span-2">
            <CollapsibleTrigger className="group flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground">
              <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" /> Detail tambahan (opsional)
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 grid gap-3 sm:grid-cols-[1fr_200px]">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Alasan khusus item ini</Label>
                <Input value={item.reason} onChange={(ev) => onChange({ reason: ev.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Dibutuhkan tanggal</Label>
                <Input type="date" value={item.neededDate} onChange={(ev) => onChange({ neededDate: ev.target.value })} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button variant="ghost" size="icon" onClick={onDuplicate} aria-label="Duplikat item">
            <Copy className="size-4 text-muted-foreground" />
          </Button>
          {canRemove && (
            <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Hapus item">
              <Trash2 className="size-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>
      <datalist id="units">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
    </div>
  );
}
