"use client";

import { useState } from "react";
import { Loader2, Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAction } from "@/components/app/use-action";
import { formatDateTime, initials } from "@/lib/format";
import { PRIORITY, TICKET_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { addTicketCommentAction, updateTicketAction } from "../../actions";

interface CommentView {
  id: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  authorName: string;
  mine: boolean;
  fromReporter: boolean;
}

function Bubble({ authorName, createdAt, body, internal, highlight }: { authorName: string; createdAt: string; body: string; internal?: boolean; highlight?: boolean }) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          highlight ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        {initials(authorName)}
      </span>
      <div className={cn("min-w-0 flex-1 rounded-lg border px-3.5 py-2.5", internal && "border-amber-300/60 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-950/30")}>
        <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
          <span className="font-medium">{authorName}</span>
          <span className="text-muted-foreground">{formatDateTime(createdAt)}</span>
          {internal && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              <Lock className="size-3" /> Catatan internal
            </span>
          )}
        </div>
        <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-line">{body}</p>
      </div>
    </li>
  );
}

export function TicketConversation({
  ticketId,
  manager,
  closed,
  opening,
  comments,
}: {
  ticketId: string;
  manager: boolean;
  closed: boolean;
  opening: { body: string; authorName: string; createdAt: string };
  comments: CommentView[];
}) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const send = useAction(addTicketCommentAction, { onSuccess: () => setBody("") });
  return (
    <div className="space-y-5">
      <ol className="space-y-4">
        <Bubble {...opening} highlight />
        {comments.map((c) => (
          <Bubble key={c.id} authorName={c.authorName} createdAt={c.createdAt} body={c.body} internal={c.isInternal} highlight={c.fromReporter} />
        ))}
      </ol>
      {closed ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Tiket sudah ditutup. Buat tiket baru jika masalah muncul lagi.</p>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) void send.run(ticketId, body, internal);
          }}
        >
          <Label htmlFor="reply" className="sr-only">
            Tanggapan
          </Label>
          <Textarea id="reply" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Tulis tanggapan…" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {manager ? (
              <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Switch checked={internal} onCheckedChange={setInternal} /> Catatan internal (tidak terlihat pelapor)
              </label>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={send.pending || !body.trim()}>
              {send.pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Kirim
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

type Status = keyof typeof TICKET_STATUS;
type Priority = keyof typeof PRIORITY;

export function TicketManagePanel({
  ticketId,
  users,
  initial,
}: {
  ticketId: string;
  users: Array<{ id: string; fullName: string }>;
  initial: { status: Status; priority: Priority | null; assigneeId: string | null; forwardedTo: string | null };
}) {
  const [f, setF] = useState(initial);
  const save = useAction(updateTicketAction);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v as Status })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TICKET_STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Prioritas penanganan</Label>
        <Select value={f.priority ?? "none"} onValueChange={(v) => setF({ ...f, priority: v === "none" ? null : (v as Priority) })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Ikuti urgensi pelapor</SelectItem>
            {Object.entries(PRIORITY).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Penanggung jawab</Label>
        <Select value={f.assigneeId ?? "none"} onValueChange={(v) => setF({ ...f, assigneeId: v === "none" ? null : v })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Belum ditetapkan</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {f.status === "FORWARDED" && (
        <div className="space-y-1.5">
          <Label htmlFor="fwd">Diteruskan ke</Label>
          <Input id="fwd" value={f.forwardedTo ?? ""} placeholder="mis. Tim Teknis / vendor aplikasi" onChange={(e) => setF({ ...f, forwardedTo: e.target.value || null })} />
        </div>
      )}
      <Button className="w-full" disabled={!dirty || save.pending} onClick={() => void save.run(ticketId, f)}>
        {save.pending && <Loader2 className="size-4 animate-spin" />} Simpan perubahan
      </Button>
    </div>
  );
}
