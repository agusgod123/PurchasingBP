import { CheckCircle2, FileUp, GitCommitHorizontal, MessageSquare, Truck, XCircle, ShoppingCart } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/server/queries/requests";

function Icon({ e }: { e: TimelineEvent }) {
  const cls = "size-3.5";
  switch (e.kind) {
    case "comment":
      return <MessageSquare className={cls} />;
    case "decision":
      return e.tone === "danger" ? <XCircle className={cls} /> : <CheckCircle2 className={cls} />;
    case "document":
      return <FileUp className={cls} />;
    case "po":
      return <ShoppingCart className={cls} />;
    case "followup":
      return <Truck className={cls} />;
    default:
      return <GitCommitHorizontal className={cls} />;
  }
}

const toneBg: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  neutral: "bg-muted text-muted-foreground",
};

/** Riwayat terpadu: status, keputusan, komentar, dokumen, pesanan, dan tindak lanjut vendor. */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return <p className="text-sm text-muted-foreground">Belum ada aktivitas.</p>;
  return (
    <ol className="space-y-4">
      {[...events].reverse().map((e) => (
        <li key={e.id} className="flex gap-3">
          <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", toneBg[e.tone ?? "neutral"])}>
            <Icon e={e} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium leading-snug">{e.title}</div>
            {e.body && <p className={cn("mt-0.5 whitespace-pre-line text-[13px]", e.kind === "comment" ? "text-foreground" : "text-muted-foreground")}>{e.body}</p>}
            <div className="mt-0.5 text-xs text-muted-foreground">
              {e.actor ? `${e.actor} · ` : ""}
              {formatDateTime(e.at)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
