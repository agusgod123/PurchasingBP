import "server-only";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/user";
import { can } from "@/server/auth/user";
import { PERMISSIONS } from "@/lib/permissions";
import { decStr, lineTotal } from "@/server/money";
import { pageParams, sp, type SearchParams } from "@/lib/list-params";
import { canViewRequestDetail } from "@/server/modules/requests/access";
import { listDocuments } from "@/server/modules/documents/service";
import { budgetStatus } from "@/server/modules/budget";
import { getRequestDetail } from "@/server/queries/requests";
import type { ApprovalSubjectType } from "@/generated/prisma/enums";

export async function approvalInbox(user: AuthUser, params: SearchParams) {
  const tab = sp(params, "tab") ?? "menunggu";
  const subject = sp(params, "subject") as ApprovalSubjectType | undefined;
  const q = sp(params, "q");
  const { page, pageSize, skip, take } = pageParams(params);
  const now = new Date();
  const contains = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const requestFilter = contains ? { OR: [{ requestNumber: contains }, { title: contains }] } : {};

  const [pendingCount, decidedCount] = await Promise.all([
    db.approvalAssignment.count({ where: { approverUserId: user.id, status: "PENDING" } }),
    db.approvalDecision.count({ where: { decidedById: user.id } }),
  ]);

  if (tab === "riwayat") {
    const where = {
      decidedById: user.id,
      assignment: { step: { instance: { ...(subject ? { subjectType: subject } : {}), request: requestFilter } } },
    };
    const [rows, total] = await Promise.all([
      db.approvalDecision.findMany({
        where,
        include: {
          assignment: {
            include: {
              step: {
                include: {
                  instance: {
                    include: {
                      request: { select: { id: true, requestNumber: true, title: true, estimatedTotal: true, requester: { select: { fullName: true } }, department: { select: { name: true } } } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { decidedAt: "desc" },
        skip,
        take,
      }),
      db.approvalDecision.count({ where }),
    ]);
    return {
      tab,
      pendingCount,
      decidedCount,
      total,
      page,
      pageSize,
      rows: rows.map((d) => ({
        id: d.assignment.id,
        href: `/pengajuan/${d.assignment.step.instance.request.id}`,
        subjectType: d.assignment.step.instance.subjectType,
        stepName: d.assignment.step.name,
        requestNumber: d.assignment.step.instance.request.requestNumber,
        title: d.assignment.step.instance.request.title,
        requester: d.assignment.step.instance.request.requester.fullName,
        department: d.assignment.step.instance.request.department.name,
        total: decStr(d.assignment.step.instance.request.estimatedTotal),
        dueAt: null as Date | null,
        overdue: false,
        decision: d.decision,
        decidedAt: d.decidedAt as Date | null,
        comment: d.comment,
        priority: null as string | null,
      })),
    };
  }

  const where = {
    approverUserId: user.id,
    status: "PENDING" as const,
    step: { instance: { ...(subject ? { subjectType: subject } : {}), request: requestFilter } },
  };
  const [rows, total] = await Promise.all([
    db.approvalAssignment.findMany({
      where,
      include: {
        step: {
          include: {
            instance: {
              include: {
                request: {
                  select: {
                    id: true,
                    requestNumber: true,
                    title: true,
                    estimatedTotal: true,
                    requestedPriority: true,
                    finalPriority: true,
                    neededDate: true,
                    requester: { select: { fullName: true } },
                    department: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { activatedAt: "asc" }],
      skip,
      take,
    }),
    db.approvalAssignment.count({ where }),
  ]);
  return {
    tab,
    pendingCount,
    decidedCount,
    total,
    page,
    pageSize,
    rows: rows.map((a) => ({
      id: a.id,
      href: `/persetujuan/${a.id}`,
      subjectType: a.step.instance.subjectType,
      stepName: a.step.name,
      requestNumber: a.step.instance.request.requestNumber,
      title: a.step.instance.request.title,
      requester: a.step.instance.request.requester.fullName,
      department: a.step.instance.request.department.name,
      total: decStr(a.step.instance.request.estimatedTotal),
      dueAt: a.dueAt,
      overdue: !!a.dueAt && a.dueAt < now,
      decision: null as string | null,
      decidedAt: null as Date | null,
      comment: null as string | null,
      priority: a.step.instance.request.finalPriority ?? a.step.instance.request.requestedPriority,
    })),
  };
}

export type InboxRow = Awaited<ReturnType<typeof approvalInbox>>["rows"][number];

/** Data halaman keputusan: subjek, konteks, dan rute persetujuan. */
export async function getAssignmentDetail(user: AuthUser, assignmentId: string) {
  const assignment = await db.approvalAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      step: {
        include: {
          instance: {
            include: {
              request: true,
              requestVersion: { include: { items: { orderBy: { lineNo: "asc" } } } },
              changeRequest: { include: { items: true, purchaseOrder: { include: { vendor: true, quotes: { include: { vendor: true } } } } } },
              cancellationRequest: { include: { requestedBy: { select: { fullName: true } } } },
              discrepancy: { include: { purchaseOrder: { select: { poNumber: true } }, purchaseOrderItem: true } },
            },
          },
        },
      },
    },
  });
  if (!assignment) return null;
  const instance = assignment.step.instance;
  const isMine = assignment.approverUserId === user.id;
  if (!isMine && !(await canViewRequestDetail(db, user, instance.request))) return { forbidden: true as const };

  const detail = await getRequestDetail(user, instance.requestId);
  if (!detail || detail.forbidden) return { forbidden: true as const };
  const route = detail.approvals.find((a) => a.id === instance.id)!;

  // Perbandingan dengan versi sebelumnya (untuk pengajuan yang dikirim ulang).
  let diff: Array<{ itemName: string; change: string }> = [];
  if (instance.subjectType === "REQUEST" && instance.requestVersion && instance.requestVersion.versionNumber > 1) {
    const prev = await db.requestVersion.findUnique({
      where: { requestId_versionNumber: { requestId: instance.requestId, versionNumber: instance.requestVersion.versionNumber - 1 } },
      include: { items: true },
    });
    if (prev) {
      const key = (n: string) => n.trim().toLowerCase();
      const cur = instance.requestVersion.items;
      for (const c of cur) {
        const p = prev.items.find((x) => key(x.itemNameSnapshot) === key(c.itemNameSnapshot));
        if (!p) diff.push({ itemName: c.itemNameSnapshot, change: "Item baru" });
        else {
          const changes: string[] = [];
          if (!p.quantitySnapshot.eq(c.quantitySnapshot)) changes.push(`jumlah ${p.quantitySnapshot} → ${c.quantitySnapshot}`);
          if (!p.estimatedUnitPriceSnapshot.eq(c.estimatedUnitPriceSnapshot))
            changes.push(`harga ${Number(p.estimatedUnitPriceSnapshot).toLocaleString("id-ID")} → ${Number(c.estimatedUnitPriceSnapshot).toLocaleString("id-ID")}`);
          if (p.specificationSnapshot.trim() !== c.specificationSnapshot.trim()) changes.push("spesifikasi berubah");
          if (changes.length) diff.push({ itemName: c.itemNameSnapshot, change: changes.join(", ") });
        }
      }
      for (const p of prev.items) {
        if (!cur.some((c) => key(c.itemNameSnapshot) === key(p.itemNameSnapshot))) diff.push({ itemName: p.itemNameSnapshot, change: "Dihapus" });
      }
      if (prev.titleSnapshot !== instance.requestVersion.titleSnapshot || prev.generalReasonSnapshot !== instance.requestVersion.generalReasonSnapshot) {
        diff.push({ itemName: "Judul/alasan", change: "diubah" });
      }
    }
  }

  // Penawaran vendor sebagai dasar keputusan perubahan harga.
  const quotes =
    instance.changeRequest?.purchaseOrder?.quotes.map((q) => ({
      id: q.id,
      vendor: q.vendor.name,
      totalAmount: decStr(q.totalAmount),
      quoteNumber: q.quoteNumber,
      isSelected: q.isSelected,
      quoteDate: q.quoteDate,
    })) ?? [];
  const quoteDocs = [];
  for (const q of quotes) quoteDocs.push(...(await listDocuments(user, "quote", q.id)));

  const budget = instance.subjectType === "REQUEST" ? await budgetStatus(db, instance.request.departmentId, 0, { excludeRequestId: instance.requestId }) : null;

  return {
    forbidden: false as const,
    assignment: {
      id: assignment.id,
      status: assignment.status,
      dueAt: assignment.dueAt,
      isMine,
      canDecide: isMine && assignment.status === "PENDING",
      stepName: assignment.step.name,
    },
    subjectType: instance.subjectType,
    detail,
    route,
    diff,
    changeRequest: instance.changeRequest
      ? {
          reason: instance.changeRequest.reason,
          poNumber: instance.changeRequest.purchaseOrder?.poNumber ?? null,
          vendor: instance.changeRequest.purchaseOrder?.vendor?.name ?? null,
          items: route.changeRequest?.items ?? [],
          impact: instance.changeRequest.items.reduce((acc, i) => {
            const ri = detail.items.find((x) => x.id === i.requestItemId);
            if (!ri) return acc;
            if (i.changeType === "PRICE" && i.newUnitPrice && i.oldUnitPrice) {
              return acc + Number(lineTotal(ri.quantity, i.newUnitPrice).minus(lineTotal(ri.quantity, i.oldUnitPrice)));
            }
            return acc;
          }, 0),
        }
      : null,
    quotes,
    quoteDocs: quoteDocs.map((d) => ({ ...d, canDelete: false })),
    cancellation: instance.cancellationRequest
      ? { reason: instance.cancellationRequest.reason, by: instance.cancellationRequest.requestedBy.fullName, impact: instance.cancellationRequest.impactNote }
      : null,
    discrepancy: instance.discrepancy
      ? {
          type: instance.discrepancy.type,
          quantity: decStr(instance.discrepancy.quantity),
          description: instance.discrepancy.description,
          resolutionType: instance.discrepancy.resolutionType,
          resolutionNote: instance.discrepancy.resolutionNote,
          poNumber: instance.discrepancy.purchaseOrder.poNumber,
          itemName: instance.discrepancy.purchaseOrderItem.itemName,
          unitName: instance.discrepancy.purchaseOrderItem.unitName,
        }
      : null,
    budget: budget?.budget
      ? { remaining: decStr(budget.remaining), budget: decStr(budget.budget), exceeded: budget.exceeded || Number(budget.remaining) < Number(instance.request.estimatedTotal) }
      : null,
    canSetPriority: instance.subjectType === "REQUEST" && can(user, PERMISSIONS.REQUEST_SET_PRIORITY) && isMine,
  };
}

export type AssignmentDetail = Exclude<Awaited<ReturnType<typeof getAssignmentDetail>>, null | { forbidden: true }>;
