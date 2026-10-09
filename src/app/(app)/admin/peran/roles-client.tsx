"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MoreHorizontal, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FieldHint } from "@/components/app/form-bits";
import { useAction } from "@/components/app/use-action";
import { cn } from "@/lib/utils";
import { deleteRoleAction, saveRoleAction, setRolePermissionsAction } from "../actions";

interface RoleRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  users: number;
  codes: string[];
}

export function RoleDialog({ role, trigger }: { role?: RoleRow; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const init = { code: role?.code ?? "", name: role?.name ?? "", description: role?.description ?? "" };
  const [f, setF] = useState(init);
  const save = useAction(saveRoleAction, { onSuccess: () => setOpen(false) });
  const fe = save.fieldErrors;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(init);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="size-4" /> Tambah peran
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{role ? "Ubah peran" : "Tambah peran"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="r-name">Nama *</Label>
            <Input id="r-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!fe.name} />
            <FieldHint error={fe.name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-code">Kode *</Label>
            <Input
              id="r-code"
              value={f.code}
              disabled={role?.isSystem}
              onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/\s+/g, "_") })}
              aria-invalid={!!fe.code}
            />
            <FieldHint error={fe.code} hint={role?.isSystem ? "Kode peran bawaan tidak dapat diubah." : "Mis. KOORDINATOR_GUDANG"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-desc">Deskripsi</Label>
            <Textarea id="r-desc" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button disabled={save.pending} onClick={() => void save.run(role?.id ?? null, { ...f, description: f.description || null })}>
            {save.pending && <Loader2 className="size-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RoleMatrix({ roles, permissions }: { roles: RoleRow[]; permissions: Array<{ code: string; name: string; module: string }> }) {
  const router = useRouter();
  const initial = Object.fromEntries(roles.map((r) => [r.id, new Set(r.codes)]));
  const [state, setState] = useState<Record<string, Set<string>>>(initial);
  const [saving, setSaving] = useState(false);
  const del = useAction(deleteRoleAction);
  const changed = roles.filter((r) => {
    const a = state[r.id] ?? new Set();
    return a.size !== r.codes.length || r.codes.some((c) => !a.has(c));
  });
  const toggle = (roleId: string, code: string, on: boolean) =>
    setState((s) => {
      const next = new Set(s[roleId]);
      if (on) next.add(code);
      else next.delete(code);
      return { ...s, [roleId]: next };
    });
  const modules = [...new Set(permissions.map((p) => p.module))];
  const saveAll = async () => {
    setSaving(true);
    try {
      for (const r of changed) {
        const res = await setRolePermissionsAction(r.id, [...state[r.id]]);
        if (!res.ok) {
          toast.error(`${r.name}: ${res.error}`);
          return;
        }
      }
      toast.success(`Izin ${changed.length} peran disimpan.`);
      router.refresh();
    } catch {
      toast.error("Koneksi ke server gagal. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className="sticky left-0 z-10 min-w-56 bg-card px-4 py-3 text-left font-medium">Izin</th>
              {roles.map((r) => (
                <th key={r.id} className="min-w-28 px-2 py-3 align-bottom font-medium">
                  <div className="flex items-start justify-center gap-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn("cursor-default text-center text-[13px] leading-tight", changed.some((c) => c.id === r.id) && "text-primary")}>
                          {r.name}
                          <span className="block text-[11px] font-normal text-muted-foreground">{r.users} pengguna</span>
                        </span>
                      </TooltipTrigger>
                      {r.description && <TooltipContent className="max-w-64">{r.description}</TooltipContent>}
                    </Tooltip>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-6" aria-label={`Menu ${r.name}`}>
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <RoleDialog
                          role={r}
                          trigger={
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                              <Pencil className="size-4" /> Ubah nama/deskripsi
                            </DropdownMenuItem>
                          }
                        />
                        {!r.isSystem && (
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={r.users > 0}
                            onSelect={() => {
                              if (confirm(`Hapus peran ${r.name}?`)) void del.run(r.id);
                            }}
                          >
                            <Trash2 className="size-4" /> Hapus
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <Fragment key={m}>
                <tr className="bg-muted/40">
                  <td colSpan={roles.length + 1} className="sticky left-0 px-4 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {m}
                  </td>
                </tr>
                {permissions
                  .filter((p) => p.module === m)
                  .map((p) => (
                    <tr key={p.code} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="sticky left-0 z-10 bg-card px-4 py-2">
                        <span className="block">{p.name}</span>
                        <code className="text-[11px] text-muted-foreground">{p.code}</code>
                      </td>
                      {roles.map((r) => (
                        <td key={r.id} className="px-2 py-2 text-center">
                          <Checkbox
                            checked={state[r.id]?.has(p.code) ?? false}
                            onCheckedChange={(c) => toggle(r.id, p.code, !!c)}
                            aria-label={`${p.name} untuk ${r.name}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className={cn(
          "sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg transition-opacity",
          changed.length ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!changed.length}
      >
        <span className="text-sm">
          Perubahan pada <strong>{changed.map((c) => c.name).join(", ")}</strong>
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setState(initial)} disabled={saving}>
            <Undo2 className="size-4" /> Batalkan
          </Button>
          <Button onClick={() => void saveAll()} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />} Simpan perubahan
          </Button>
        </div>
      </div>
    </div>
  );
}
