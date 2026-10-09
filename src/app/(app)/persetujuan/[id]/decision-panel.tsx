"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAction } from "@/components/app/use-action";
import { PRIORITY } from "@/lib/status";
import type { Priority } from "@/generated/prisma/enums";
import { decideAction } from "../actions";

export function DecisionPanel({
  assignmentId,
  canSetPriority,
  defaultPriority,
  subjectLabel,
}: {
  assignmentId: string;
  canSetPriority: boolean;
  defaultPriority: Priority;
  subjectLabel: string;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [priority, setPriority] = useState<Priority>(defaultPriority);
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const decide = useAction(decideAction, {
    success: (d) =>
      d.outcome === "APPROVED" ? "Disetujui. Proses berlanjut ke tahap berikutnya." : d.outcome === "REJECTED" ? "Ditolak dan dikembalikan ke pemohon." : "Keputusan Anda tercatat.",
    onSuccess: () => router.push("/persetujuan"),
    refresh: false,
  });

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-[15px] font-semibold">Keputusan Anda</h2>
        <p className="text-[13px] text-muted-foreground">{subjectLabel}</p>
      </div>
      {canSetPriority && (
        <div className="space-y-1.5">
          <Label>Prioritas final</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PRIORITY) as Priority[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="comment">
          Catatan {mode === "reject" ? <span className="text-destructive">* wajib saat menolak</span> : <span className="text-muted-foreground">(opsional)</span>}
        </Label>
        <Textarea
          id="comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={mode === "reject" ? "Jelaskan apa yang perlu diperbaiki pemohon…" : "Catatan untuk pemohon/purchasing"}
          aria-invalid={mode === "reject" && !comment.trim()}
        />
      </div>
      {mode === "reject" ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setMode("idle")} disabled={decide.pending}>
            Batal
          </Button>
          <Button
            variant="destructive"
            disabled={decide.pending || !comment.trim()}
            onClick={() => void decide.run(assignmentId, { decision: "REJECT", comment })}
          >
            {decide.pending ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />} Kirim penolakan
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900 dark:text-red-300" onClick={() => setMode("reject")}>
            <XCircle className="size-4" /> Tolak / revisi
          </Button>
          <Button
            className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={decide.pending}
            onClick={() => void decide.run(assignmentId, { decision: "APPROVE", comment, finalPriority: canSetPriority ? priority : null })}
          >
            {decide.pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Setujui
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Penolakan mengembalikan pengajuan kepada pemohon untuk direvisi. Keputusan tercatat permanen dalam riwayat.
      </p>
    </div>
  );
}
