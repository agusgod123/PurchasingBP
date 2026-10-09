import { CheckCircle2, Circle, CircleDot, CircleSlash, Clock, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/app/ui";
import {
  APPROVAL_INSTANCE_STATUS,
  APPROVAL_STEP_STATUS,
  APPROVAL_SUBJECT,
  ASSIGNMENT_STATUS,
  ROUTING_MODE,
  STEP_MODE,
} from "@/lib/status";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RequestDetail } from "@/server/queries/requests";

type Instance = RequestDetail["approvals"][number];

function StepIcon({ status }: { status: string }) {
  switch (status) {
    case "APPROVED":
      return <CheckCircle2 className="size-5 text-emerald-600" />;
    case "REJECTED":
      return <XCircle className="size-5 text-red-600" />;
    case "PENDING":
      return <CircleDot className="size-5 text-amber-500" />;
    case "SKIPPED":
    case "CANCELLED":
      return <CircleSlash className="size-5 text-muted-foreground" />;
    default:
      return <Circle className="size-5 text-muted-foreground/50" />;
  }
}

export function ApprovalRoute({ instance, now = new Date() }: { instance: Instance; now?: Date }) {
  const st = APPROVAL_INSTANCE_STATUS[instance.status];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{APPROVAL_SUBJECT[instance.subjectType]}</span>
        {instance.versionNumber && <span className="text-xs text-muted-foreground">Versi {instance.versionNumber}</span>}
        <StatusBadge label={st.label} tone={st.tone} />
        <span className="text-xs text-muted-foreground">
          {instance.ruleName ?? "Tanpa aturan"} · {ROUTING_MODE[instance.routingMode].label}
        </span>
      </div>
      {instance.holdReason && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{instance.holdReason}</p>
      )}
      {instance.changeRequest && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="font-medium">
            Perubahan diajukan {instance.changeRequest.createdBy}
            {instance.changeRequest.poNumber && ` (${instance.changeRequest.poNumber})`}
          </div>
          <p className="text-muted-foreground">{instance.changeRequest.reason}</p>
          <ChangeList items={instance.changeRequest.items} />
        </div>
      )}
      {instance.cancellation && (
        <p className="text-sm text-muted-foreground">
          Diusulkan {instance.cancellation.by}: {instance.cancellation.reason}
        </p>
      )}
      <ol className="relative space-y-0">
        {instance.steps.map((s, i) => (
          <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < instance.steps.length - 1 && <span aria-hidden className="absolute left-[9.5px] top-6 h-[calc(100%-1rem)] w-px bg-border" />}
            <span className="relative z-10 bg-card">
              <StepIcon status={s.status} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium">
                  {s.stepNumber}. {s.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {APPROVAL_STEP_STATUS[s.status].label}
                  {s.assignments.length > 1 && ` · ${STEP_MODE[s.approvalMode].label} harus setuju`}
                </span>
              </div>
              <ul className="mt-1.5 space-y-1.5">
                {s.assignments
                  .filter((a) => a.status !== "REASSIGNED" || a.decisions.length > 0)
                  .map((a) => {
                    const overdue = a.status === "PENDING" && a.dueAt && new Date(a.dueAt) < now;
                    return (
                      <li key={a.id} className="text-sm">
                        <div className="flex flex-wrap items-center gap-x-2">
                          <span>{a.approverName}</span>
                          <span
                            className={cn(
                              "text-xs",
                              a.status === "APPROVED" || a.status === "CARRIED_OVER"
                                ? "text-emerald-700 dark:text-emerald-400"
                                : a.status === "REJECTED"
                                  ? "text-red-700 dark:text-red-400"
                                  : "text-muted-foreground",
                            )}
                          >
                            {ASSIGNMENT_STATUS[a.status].label}
                          </span>
                          {a.status === "PENDING" && a.dueAt && (
                            <span className={cn("inline-flex items-center gap-1 text-xs", overdue ? "text-red-600" : "text-muted-foreground")}>
                              <Clock className="size-3" /> {overdue ? "Lewat tenggat" : "Tenggat"} {formatDateTime(a.dueAt)}
                            </span>
                          )}
                        </div>
                        {a.decisions.map((d) => (
                          <div key={d.id} className="mt-1 rounded-md bg-muted/50 px-2.5 py-1.5 text-[13px]">
                            <span className="text-muted-foreground">{formatDateTime(d.decidedAt)}</span>
                            {d.comment && <p className="whitespace-pre-line">“{d.comment}”</p>}
                          </div>
                        ))}
                        {a.note && a.status !== "PENDING" && <p className="text-xs text-muted-foreground">{a.note}</p>}
                      </li>
                    );
                  })}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ChangeList({ items }: { items: NonNullable<Instance["changeRequest"]>["items"] }) {
  const fmt = (v: string | null) => (v === null ? "—" : new Intl.NumberFormat("id-ID").format(Number(v)));
  return (
    <ul className="mt-2 space-y-1">
      {items.map((c) => (
        <li key={c.id} className="text-[13px]">
          <span className="font-medium">{c.itemName}</span>:{" "}
          {c.changeType === "PRICE" && (
            <>
              harga Rp {fmt(c.oldUnitPrice)} → <strong>Rp {fmt(c.newUnitPrice)}</strong>
            </>
          )}
          {c.changeType === "QUANTITY" && (
            <>
              jumlah {fmt(c.oldQuantity)} → <strong>{fmt(c.newQuantity)}</strong>
            </>
          )}
          {c.changeType === "SPECIFICATION" && (
            <>
              spesifikasi “{c.oldSpecification}” → <strong>“{c.newSpecification}”</strong>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
