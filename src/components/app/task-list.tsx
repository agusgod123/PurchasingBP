import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { TaskGroup } from "@/server/queries/tasks";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const dot: Record<string, string> = {
  danger: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
  violet: "bg-violet-500",
  neutral: "bg-zinc-400",
};

export function TaskList({ group, limit }: { group: TaskGroup; limit?: number }) {
  const items = limit ? group.items.slice(0, limit) : group.items;
  return (
    <ul className="divide-y">
      {items.map((t) => (
        <li key={`${group.key}-${t.id}`}>
          <Link href={t.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:px-5">
            <span className={cn("size-2 shrink-0 rounded-full", dot[t.tone ?? "neutral"])} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{t.title}</span>
              <span className="block truncate text-[13px] text-muted-foreground">{t.description}</span>
            </span>
            {t.due && (
              <span className={cn("hidden shrink-0 text-xs sm:block", t.overdue ? "font-medium text-red-600" : "text-muted-foreground")}>
                {t.overdue ? "Lewat tenggat" : "Tenggat"} {formatDateTime(t.due)}
              </span>
            )}
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

