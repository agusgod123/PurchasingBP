import Link from "next/link";
import { Check, ChevronLeft, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneClass, type Tone, PRIORITY, STAGES, type StageKey } from "@/lib/status";
import { formatCurrency } from "@/lib/format";
import type { Priority } from "@/generated/prisma/enums";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export function PageHeader({
  title,
  description,
  actions,
  back,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 space-y-3", className)}>
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
          {description && <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>}
          {meta && <div className="flex flex-wrap items-center gap-2 pt-1">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function StatusBadge({ label, tone = "neutral", className }: { label: string; tone?: Tone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneClass(tone),
        className,
      )}
    >
      {label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const p = PRIORITY[priority];
  if (priority === "NORMAL" || priority === "LOW") return <span className="text-xs text-muted-foreground">{p.label}</span>;
  return <StatusBadge label={p.label} tone={p.tone} />;
}

export function Money({ value, className }: { value: number | string | { toString(): string } | null | undefined; className?: string }) {
  return <span className={cn("tabular whitespace-nowrap", className)}>{formatCurrency(value)}</span>;
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <Empty className={cn("border border-dashed bg-card py-12", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon className="size-5" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/** Stepper 6 tahap yang dilihat pemohon. */
export function StageStepper({ current, cancelled, className }: { current: StageKey; cancelled?: boolean; className?: string }) {
  const idx = STAGES.findIndex((s) => s.key === current);
  return (
    <ol className={cn("grid grid-cols-6 gap-1.5", className)} aria-label="Tahap pengajuan">
      {STAGES.map((s, i) => {
        const done = !cancelled && (i < idx || current === "done");
        const active = !cancelled && i === idx && current !== "done";
        return (
          <li key={s.key} className="min-w-0" aria-current={active ? "step" : undefined}>
            <div
              className={cn(
                "h-1.5 rounded-full bg-muted",
                done && "bg-primary",
                active && "bg-primary/60",
                cancelled && "bg-muted",
              )}
            />
            <div
              className={cn(
                "mt-2 flex items-center gap-1 truncate text-[11px] font-medium text-muted-foreground sm:text-xs",
                (done || active) && "text-foreground",
              )}
            >
              {done && <Check className="hidden size-3.5 shrink-0 text-primary sm:block" />}
              <span className="truncate">{s.label}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function KeyValue({ items, className }: { items: Array<{ label: string; value: React.ReactNode; wide?: boolean }>; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2", className)}>
      {items.map((it) => (
        <div key={it.label} className={cn("min-w-0", it.wide && "sm:col-span-2")}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{it.label}</dt>
          <dd className="mt-1 break-words text-sm">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  id,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20 rounded-xl border bg-card", className)}>
      <header className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: Tone;
}) {
  const content = (
    <div
      className={cn(
        "h-full rounded-xl border bg-card p-4 transition-colors",
        href && "hover:border-primary/40 hover:bg-primary/[0.02]",
      )}
    >
      <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", tone === "neutral" ? "bg-muted-foreground/40" : toneDot(tone))} />
        {label}
      </div>
      <div className="tabular mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

function toneDot(tone: Tone) {
  switch (tone) {
    case "info":
      return "bg-blue-500";
    case "warning":
      return "bg-amber-500";
    case "success":
      return "bg-emerald-500";
    case "danger":
      return "bg-red-500";
    case "violet":
      return "bg-violet-500";
    default:
      return "bg-zinc-400";
  }
}
