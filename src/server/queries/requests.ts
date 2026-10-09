import "server-only";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/user";
import { can } from "@/server/auth/user";
import { PERMISSIONS } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";
import type { PurchaseOrderStatus, RequestStatus } from "@/generated/prisma/enums";
import { deriveStage, PO_STATUS, REQUEST_STATUS, type StageKey } from "@/lib/status";
import { canViewRequestDetail, detailVisibilityWhere } from "@/server/modules/requests/access";
import { itemFulfilment } from "@/server/modules/requests/service";
import { listDocuments, type DocumentView } from "@/server/modules/documents/service";
import { checkDocumentRequirements } from "@/server/modules/documents/requirements";
import { budgetStatus } from "@/server/modules/budget";
import { getSettings } from "@/server/settings";
import { dec, decStr, lineTotal, sum } from "@/server/money";
import { dateRangeParams, orderByField, pageParams, sortParams, sp, type SearchParams } from "@/lib/list-params";
import { zonedMidnight } from "@/server/time";

const ACTIVE_STATUSES: RequestStatus[] = [
  "PENDING_APPROVAL",
  "ON_HOLD",
  "APPROVED",
  "IN_PROCUREMENT",
  "READY_FOR_HANDOVER",
  "AWAITING_CONFIRMATION",
  "CANCELLATION_REQUESTED",
];

function poStatusesByRequest(links: Array<{ requestId: string; purchaseOrder: { status: PurchaseOrderStatus } }>) {
  const map = new Map<string, PurchaseOrderStatus[]>();
  for (const l of links) {
    if (l.purchaseOrder.status === "CANCELLED") continue;
    map.set(l.requestId, [...(map.get(l.requestId) ?? []), l.purchaseOrder.status]);
  }
  return map;
}

function searchWhere(q?: string): Prisma.RequestWhereInput {
  if (!q) return {};
  const contains = { contains: q, mode: "insensitive" as const };
  return { OR: [{ requestNumber: contains }, { title: contains }, { items: { some: { itemName: contains } } }] };
}

function dateWhere(params: SearchParams): Prisma.RequestWhereInput {
  const { from, to } = dateRangeParams(params);
  if (!from && !to) return {};
  return {
    createdAt: {
      ...(from ? { gte: zonedMidnight(from) } : {}),
      ...(to ? { lt: new Date(zonedMidnight(to).getTime() + 86_400_000) } : {}),
    },
  };
}

export interface RequestRow {
  id: string;
  requestNumber: string | null;
  title: string;
  status: RequestStatus;
  stage: StageKey;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  estimatedTotal: string;
  neededDate: Date;
  submittedAt: Date | null;
  updatedAt: Date;
  itemCount: number;
  firstItem: string | null;
  requesterName: string;
  departmentName: string;
  canOpen: boolean;
}

const MY_TABS: Record<string, Prisma.RequestWhereInput> = {
  aktif: { status: { in: ACTIVE_STATUSES } },
  tindakan: { status: { in: ["DRAFT", "REVISION_REQUIRED", "AWAITING_CONFIRMATION"] } },
  selesai: { status: "COMPLETED" },
  batal: { status: "CANCELLED" },
};

export async function listMyRequests(user: AuthUser, params: SearchParams) {
  const { page, pageSize, skip, take } = pageParams(params);
  const { sort, dir } = sortParams(params, ["updatedAt", "neededDate", "estimatedTotal", "requestNumber"] as const, "updatedAt");
  const tab = sp(params, "tab");
  const status = sp(params, "status") as RequestStatus | undefined;
  const where: Prisma.RequestWhereInput = {
    requesterId: user.id,
    ...(tab && MY_TABS[tab] ? MY_TABS[tab] : {}),
    ...(status ? { status } : {}),
    ...searchWhere(sp(params, "q")),
    ...dateWhere(params),
  };
  const [rows, total, counts] = await Promise.all([
    db.request.findMany({
      where,
      include: {
        items: { select: { itemName: true }, orderBy: { lineNo: "asc" } },
        department: { select: { name: true } },
        purchaseOrderLinks: { select: { requestId: true, purchaseOrder: { select: { status: true } } } },
      },
      orderBy: orderByField(sort, dir, ["requestNumber"]),
      skip,
      take,
    }),
    db.request.count({ where }),
    db.request.groupBy({ by: ["status"], where: { requesterId: user.id }, _count: true }),
  ]);
  const countBy = (statuses: RequestStatus[]) => counts.filter((c) => statuses.includes(c.status)).reduce((a, c) => a + c._count, 0);
  const tabCounts = {
    semua: counts.reduce((a, c) => a + c._count, 0),
    aktif: countBy(ACTIVE_STATUSES),
    tindakan: countBy(["DRAFT", "REVISION_REQUIRED", "AWAITING_CONFIRMATION"]),
    selesai: countBy(["COMPLETED"]),
    batal: countBy(["CANCELLED"]),
  };
  return {
    rows: rows.map((r) => toRow(r, user.fullName, true)),
    total,
    page,
    pageSize,
    tabCounts,
  };
}

function toRow(
  r: Prisma.RequestGetPayload<{
    include: {
      items: { select: { itemName: true } };
      department: { select: { name: true } };
      purchaseOrderLinks: { select: { requestId: true; purchaseOrder: { select: { status: true } } } };
    };
  }>,
  requesterName: string,
  canOpen: boolean,
): RequestRow {
  const poStatuses = poStatusesByRequest(r.purchaseOrderLinks).get(r.id) ?? [];
  return {
    id: r.id,
    requestNumber: r.requestNumber,
    title: r.title,
    status: r.status,
    stage: deriveStage(r.status, poStatuses),
    priority: r.finalPriority ?? r.requestedPriority,
    estimatedTotal: decStr(r.estimatedTotal),
    neededDate: r.neededDate,
    submittedAt: r.submittedAt,
    updatedAt: r.updatedAt,
    itemCount: r.items.length,
    firstItem: r.items[0]?.itemName ?? null,
    requesterName,
    departmentName: r.department.name,
    canOpen,
  };
}

/** Ringkasan lintas bagian: semua pegawai dapat melihat ringkasan, detail hanya sesuai hak akses. */
export async function listAllRequests(user: AuthUser, params: SearchParams) {
  const { page, pageSize, skip, take } = pageParams(params);
  const { sort, dir } = sortParams(params, ["submittedAt", "neededDate", "requestNumber", "updatedAt"] as const, "submittedAt");
  const status = sp(params, "status") as RequestStatus | undefined;
  const departmentId = sp(params, "department");
  const fullAccess = can(user, PERMISSIONS.REQUEST_VIEW_ALL) || can(user, PERMISSIONS.PURCHASING_MANAGE);
  const where: Prisma.RequestWhereInput = {
    status: status ? status : { not: "DRAFT" },
    ...(departmentId ? { departmentId } : {}),
    ...searchWhere(sp(params, "q")),
    ...dateWhere(params),
  };
  const [rows, total, visible] = await Promise.all([
    db.request.findMany({
      where,
      include: {
        items: { select: { itemName: true }, orderBy: { lineNo: "asc" } },
        department: { select: { name: true } },
        requester: { select: { fullName: true } },
        purchaseOrderLinks: { select: { requestId: true, purchaseOrder: { select: { status: true } } } },
      },
      orderBy: [orderByField(sort, dir, ["submittedAt", "requestNumber"])],
      skip,
      take,
    }),
    db.request.count({ where }),
    fullAccess
      ? Promise.resolve(null)
      : db.request.findMany({ where: { AND: [where, detailVisibilityWhere(user)] }, select: { id: true } }).then((x) => new Set(x.map((r) => r.id))),
  ]);
  return {
    rows: rows.map((r) => {
      const canOpen = fullAccess || (visible?.has(r.id) ?? false);
      const row = toRow(r, r.requester.fullName, canOpen);
      return canOpen ? row : { ...row, estimatedTotal: "" };
    }),
    total,
    page,
    pageSize,
    showAmounts: fullAccess,
  };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export type TimelineEvent = {
  id: string;
  at: Date;
  kind: "status" | "comment" | "decision" | "document" | "po" | "followup" | "version";
  title: string;
  body?: string | null;
  actor?: string | null;
  tone?: "neutral" | "info" | "warning" | "success" | "danger" | "violet";
};

export async function getRequestDetail(user: AuthUser, requestId: string) {
  const request = await db.request.findUnique({
    where: { id: requestId },
    include: {
      requester: { include: { employee: { include: { supervisor: { select: { fullName: true } } } } } },
      department: true,
      finalPrioritySetBy: { select: { fullName: true } },
      items: { orderBy: { lineNo: "asc" }, include: { category: true, catalogItem: { select: { code: true } } } },
      versions: { orderBy: { versionNumber: "desc" }, include: { submittedBy: { select: { fullName: true } }, items: { orderBy: { lineNo: "asc" } } } },
      statusHistory: { orderBy: { changedAt: "asc" }, include: { changedBy: { select: { fullName: true } } } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { fullName: true } } } },
      approvalInstances: {
        orderBy: { startedAt: "desc" },
        include: {
          rule: { select: { name: true, code: true } },
          requestVersion: { select: { versionNumber: true } },
          changeRequest: { include: { items: true, createdBy: { select: { fullName: true } }, purchaseOrder: { select: { poNumber: true, id: true } } } },
          cancellationRequest: { include: { requestedBy: { select: { fullName: true } } } },
          discrepancy: true,
          steps: {
            orderBy: { stepNumber: "asc" },
            include: {
              assignments: {
                orderBy: { assignedAt: "asc" },
                include: {
                  approver: { select: { fullName: true } },
                  decisions: { orderBy: { decidedAt: "asc" }, include: { decidedBy: { select: { fullName: true } } } },
                },
              },
            },
          },
        },
      },
      cancellationRequests: { orderBy: { createdAt: "desc" }, include: { requestedBy: { select: { fullName: true } }, decidedBy: { select: { fullName: true } } } },
      handovers: {
        orderBy: { preparedAt: "desc" },
        include: { items: { include: { requestItem: { select: { itemName: true, unitName: true } } } }, preparedBy: { select: { fullName: true } }, confirmedBy: { select: { fullName: true } } },
      },
      purchaseOrderLinks: {
        include: {
          purchaseOrder: {
            include: {
              vendor: { select: { name: true } },
              purchasingOwner: { select: { fullName: true } },
              items: { where: { requestItem: { requestId } }, include: { receiptItems: true } },
              statusHistory: { orderBy: { changedAt: "asc" }, include: { changedBy: { select: { fullName: true } } } },
              followups: { orderBy: { createdAt: "asc" }, include: { responsibleUser: { select: { fullName: true } } } },
            },
          },
        },
      },
    },
  });
  if (!request) return null;
  if (!(await canViewRequestDetail(db, user, request))) return { forbidden: true as const };

  const settings = await getSettings();
  const fulfil = await db.$transaction((tx) => itemFulfilment(tx, requestId));
  const fulfilById = new Map(fulfil.map((f) => [f.requestItemId, f]));
  const isRequester = request.requesterId === user.id;
  const purchasing = can(user, PERMISSIONS.PURCHASING_MANAGE);

  const pos = request.purchaseOrderLinks.map((l) => l.purchaseOrder);
  const activePoStatuses = pos.filter((p) => p.status !== "CANCELLED").map((p) => p.status);
  const stage = deriveStage(request.status, activePoStatuses);

  const documents = await listDocuments(user, "request", requestId);
  const handoverDocs = new Map<string, DocumentView[]>();
  for (const h of request.handovers) handoverDocs.set(h.id, await listDocuments(user, "handover", h.id));

  const editable = isRequester && (request.status === "DRAFT" || request.status === "REVISION_REQUIRED");
  const submitChecks = editable ? await checkDocumentRequirements(db, "REQUEST_SUBMIT", { requestId, amount: request.estimatedTotal }) : [];
  const budget =
    editable && settings["budget.warning_enabled"]
      ? await budgetStatus(db, request.departmentId, request.estimatedTotal, { excludeRequestId: requestId })
      : null;

  const myPending = request.approvalInstances
    .flatMap((i) => i.steps.flatMap((s) => s.assignments.map((a) => ({ a, instance: i }))))
    .find(({ a }) => a.approverUserId === user.id && a.status === "PENDING");

  const pendingCancellation = request.cancellationRequests.find((c) => c.status === "PENDING") ?? null;
  const cancellationViaApproval =
    !!pendingCancellation &&
    request.approvalInstances.some((i) => i.cancellationRequestId === pendingCancellation.id && i.status === "IN_PROGRESS");

  // Timeline terpadu (pola chatter): status, versi, keputusan, komentar, dokumen, PO, tindak lanjut.
  const timeline: TimelineEvent[] = [];
  for (const h of request.statusHistory) {
    timeline.push({
      id: `s-${h.id}`,
      at: h.changedAt,
      kind: "status",
      title: h.fromStatus ? REQUEST_STATUS[h.toStatus].label : "Draf dibuat",
      tone: REQUEST_STATUS[h.toStatus].tone,
      body: h.reason,
      actor: h.changedBy?.fullName,
    });
  }
  for (const i of request.approvalInstances) {
    for (const s of i.steps) {
      for (const a of s.assignments) {
        for (const d of a.decisions) {
          timeline.push({
            id: `d-${d.id}`,
            at: d.decidedAt,
            kind: "decision",
            title: d.decision === "APPROVE" ? `Disetujui — ${s.name}` : `Ditolak — ${s.name}`,
            body: d.comment,
            actor: d.decidedBy.fullName,
            tone: d.decision === "APPROVE" ? "success" : "danger",
          });
        }
      }
    }
  }
  for (const c of request.comments) {
    timeline.push({ id: `c-${c.id}`, at: c.createdAt, kind: "comment", title: "Komentar", body: c.body, actor: c.author.fullName });
  }
  for (const d of documents) {
    timeline.push({ id: `f-${d.id}`, at: d.createdAt, kind: "document", title: `Dokumen diunggah: ${d.originalFilename}`, actor: d.uploadedByName });
  }
  for (const po of pos) {
    for (const h of po.statusHistory) {
      timeline.push({
        id: `p-${h.id}`,
        at: h.changedAt,
        kind: "po",
        title: `${po.poNumber}: ${PO_STATUS[h.toStatus].label}`,
        body: h.reason,
        actor: h.changedBy?.fullName,
        tone: "info",
      });
    }
    for (const f of po.followups) {
      timeline.push({
        id: `u-${f.id}`,
        at: f.createdAt,
        kind: "followup",
        title: `${po.poNumber}: tindak lanjut vendor`,
        body: [f.reason, f.actionTaken, f.newEta ? `ETA baru ${f.newEta.toISOString().slice(0, 10)}` : null].filter(Boolean).join(" · "),
        actor: f.responsibleUser.fullName,
        tone: f.followupType === "DELAY" ? "warning" : "neutral",
      });
    }
  }
  timeline.sort((a, b) => a.at.getTime() - b.at.getTime());

  const visiblePo = purchasing || isRequester || can(user, PERMISSIONS.REQUEST_VIEW_ALL);

  return {
    forbidden: false as const,
    request: {
      id: request.id,
      requestNumber: request.requestNumber,
      title: request.title,
      generalReason: request.generalReason,
      requestType: request.requestType,
      status: request.status,
      stage,
      requestedPriority: request.requestedPriority,
      finalPriority: request.finalPriority,
      finalPrioritySetBy: request.finalPrioritySetBy?.fullName ?? null,
      neededDate: request.neededDate,
      estimatedTotal: decStr(request.estimatedTotal),
      currentVersionNumber: request.currentVersionNumber,
      holdReason: request.holdReason,
      submittedAt: request.submittedAt,
      approvedAt: request.approvedAt,
      completedAt: request.completedAt,
      cancelledAt: request.cancelledAt,
      cancellationReason: request.cancellationReason,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      lockVersion: request.lockVersion,
      requester: {
        id: request.requester.id,
        fullName: request.requester.fullName,
        email: request.requester.email,
        position: request.requester.employee?.positionName ?? null,
        supervisor: request.requester.employee?.supervisor?.fullName ?? null,
      },
      department: { id: request.department.id, name: request.department.name },
    },
    items: request.items.map((it) => {
      const f = fulfilById.get(it.id);
      return {
        id: it.id,
        lineNo: it.lineNo,
        itemName: it.itemName,
        specification: it.specification,
        category: it.category?.name ?? null,
        catalogCode: it.catalogItem?.code ?? null,
        quantity: decStr(it.quantity),
        cancelledQuantity: decStr(it.cancelledQuantity),
        unitName: it.unitName,
        estimatedUnitPrice: decStr(it.estimatedUnitPrice),
        lineTotal: decStr(lineTotal(it.quantity, it.estimatedUnitPrice)),
        reason: it.reason,
        neededDate: it.neededDate,
        required: decStr(f?.required),
        allocated: decStr(f?.allocated),
        received: decStr(f?.received),
        handedOver: decStr(f?.handedOver),
      };
    }),
    versions: request.versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      submittedAt: v.submittedAt,
      submittedBy: v.submittedBy.fullName,
      changeSummary: v.changeSummary,
      total: decStr(v.estimatedTotalSnapshot),
      title: v.titleSnapshot,
      items: v.items.map((i) => ({
        itemName: i.itemNameSnapshot,
        specification: i.specificationSnapshot,
        quantity: decStr(i.quantitySnapshot),
        unitName: i.unitNameSnapshot,
        price: decStr(i.estimatedUnitPriceSnapshot),
      })),
    })),
    approvals: request.approvalInstances.map((i) => ({
      id: i.id,
      subjectType: i.subjectType,
      status: i.status,
      routingMode: i.routingMode,
      ruleName: i.rule?.name ?? (i.subjectType === "CHANGE_REQUEST" ? "Bawaan: pemohon + atasan pemohon" : null),
      holdReason: i.holdReason,
      versionNumber: i.requestVersion?.versionNumber ?? null,
      startedAt: i.startedAt,
      completedAt: i.completedAt,
      changeRequest: i.changeRequest
        ? {
            id: i.changeRequest.id,
            reason: i.changeRequest.reason,
            status: i.changeRequest.status,
            createdBy: i.changeRequest.createdBy.fullName,
            poNumber: i.changeRequest.purchaseOrder?.poNumber ?? null,
            items: i.changeRequest.items.map((c) => ({
              id: c.id,
              changeType: c.changeType,
              itemName: request.items.find((x) => x.id === c.requestItemId)?.itemName ?? "-",
              oldUnitPrice: c.oldUnitPrice ? decStr(c.oldUnitPrice) : null,
              newUnitPrice: c.newUnitPrice ? decStr(c.newUnitPrice) : null,
              oldQuantity: c.oldQuantity ? decStr(c.oldQuantity) : null,
              newQuantity: c.newQuantity ? decStr(c.newQuantity) : null,
              oldSpecification: c.oldSpecification,
              newSpecification: c.newSpecification,
            })),
          }
        : null,
      cancellation: i.cancellationRequest ? { reason: i.cancellationRequest.reason, by: i.cancellationRequest.requestedBy.fullName } : null,
      discrepancy: i.discrepancy ? { type: i.discrepancy.type, resolutionType: i.discrepancy.resolutionType, note: i.discrepancy.resolutionNote } : null,
      steps: i.steps.map((s) => ({
        id: s.id,
        stepNumber: s.stepNumber,
        name: s.name,
        approvalMode: s.approvalMode,
        status: s.status,
        assignments: s.assignments.map((a) => ({
          id: a.id,
          approverName: a.approver.fullName,
          approverUserId: a.approverUserId,
          status: a.status,
          dueAt: a.dueAt,
          note: a.note,
          decisions: a.decisions.map((d) => ({ id: d.id, decision: d.decision, comment: d.comment, decidedAt: d.decidedAt, by: d.decidedBy.fullName })),
        })),
      })),
    })),
    purchaseOrders: visiblePo
      ? pos.map((po) => ({
          id: po.id,
          poNumber: po.poNumber,
          status: po.status,
          vendor: po.vendor?.name ?? null,
          owner: po.purchasingOwner.fullName,
          orderedAt: po.orderedAt,
          currentEta: po.currentEta,
          lines: po.items.map((l) => ({
            id: l.id,
            itemName: l.itemName,
            quantityOrdered: decStr(l.quantityOrdered),
            closedQuantity: decStr(l.closedQuantity),
            received: decStr(sum(l.receiptItems.map((r) => r.quantityAccepted))),
            unitName: l.unitName,
            unitPrice: purchasing || isRequester ? decStr(l.unitPrice) : null,
          })),
        }))
      : [],
    handovers: request.handovers.map((h) => ({
      id: h.id,
      handoverNumber: h.handoverNumber,
      status: h.status,
      location: h.location,
      notes: h.notes,
      preparedBy: h.preparedBy.fullName,
      preparedAt: h.preparedAt,
      confirmedBy: h.confirmedBy?.fullName ?? null,
      confirmedAt: h.confirmedAt,
      confirmationNote: h.confirmationNote,
      disputeReason: h.disputeReason,
      items: h.items.map((i) => ({
        id: i.id,
        itemName: i.requestItem.itemName,
        unitName: i.requestItem.unitName,
        quantity: decStr(i.quantity),
        confirmedQuantity: i.confirmedQuantity ? decStr(i.confirmedQuantity) : null,
      })),
      documents: (handoverDocs.get(h.id) ?? []).map((d) => ({ ...d, canDelete: false })),
    })),
    cancellations: request.cancellationRequests.map((c) => ({
      id: c.id,
      status: c.status,
      reason: c.reason,
      requestedBy: c.requestedBy.fullName,
      createdAt: c.createdAt,
      decidedBy: c.decidedBy?.fullName ?? null,
      decisionNote: c.decisionNote,
    })),
    documents: documents.map((d) => ({
      ...d,
      canDelete: editable && d.uploadedById === user.id,
    })),
    timeline,
    submitChecks: submitChecks.map((c) => ({ message: c.message, satisfied: c.satisfied, description: c.description })),
    budget: budget?.budget
      ? {
          budget: decStr(budget.budget),
          committed: decStr(budget.committed),
          remaining: decStr(budget.remaining),
          exceeded: budget.exceeded,
          fiscalYear: budget.fiscalYear,
        }
      : null,
    actions: {
      canEdit: editable,
      canSubmit: editable,
      canDeleteDraft: isRequester && request.status === "DRAFT" && !request.requestNumber,
      canWithdraw: isRequester && (request.status === "PENDING_APPROVAL" || request.status === "ON_HOLD"),
      canCancel:
        (isRequester || can(user, PERMISSIONS.REQUEST_CANCEL_ANY)) &&
        ((settings["request.requester_cancel_statuses"].includes(request.status) && !(request.status === "DRAFT" && !request.requestNumber)) ||
          ["APPROVED", "IN_PROCUREMENT"].includes(request.status)),
      cancelNeedsApproval: ["APPROVED", "IN_PROCUREMENT"].includes(request.status),
      canReroute: request.status === "ON_HOLD" && can(user, PERMISSIONS.APPROVAL_RULE_MANAGE),
      canComment: true,
      canSetPriority: can(user, PERMISSIONS.REQUEST_SET_PRIORITY) && !["DRAFT", "COMPLETED", "CANCELLED"].includes(request.status),
      canPrepareHandover: purchasing && request.status === "READY_FOR_HANDOVER",
      canManageHandover: purchasing,
      isRequester,
      myPendingAssignmentId: myPending?.a.id ?? null,
      canDecideCancellation:
        !!pendingCancellation && !cancellationViaApproval && can(user, PERMISSIONS.REQUEST_CANCEL_ANY),
      pendingCancellationId: pendingCancellation?.id ?? null,
    },
    availableForHandover: fulfil
      .map((f) => ({ requestItemId: f.requestItemId, available: decStr(f.received.minus(f.handedOver)) }))
      .filter((x) => dec(x.available).gt(0)),
  };
}

export type RequestDetail = Exclude<Awaited<ReturnType<typeof getRequestDetail>>, null | { forbidden: true }>;

/** Data untuk formulir pengajuan (draf baru / edit). */
export async function getRequestFormData(user: AuthUser, requestId?: string) {
  const [categories, catalog, settings] = await Promise.all([
    db.itemCategory.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    db.catalogItem.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true, unitName: true, defaultEstimatedPrice: true, categoryId: true, code: true },
      take: 2000,
    }),
    getSettings(),
  ]);
  const budget =
    user.departmentId && settings["budget.warning_enabled"]
      ? await budgetStatus(db, user.departmentId, 0, { excludeRequestId: requestId })
      : null;
  const requirements = await db.documentRequirement.findMany({ where: { stage: "REQUEST_SUBMIT", isActive: true } });
  return {
    categories,
    catalog: catalog.map((c) => ({ ...c, defaultEstimatedPrice: c.defaultEstimatedPrice ? decStr(c.defaultEstimatedPrice) : null })),
    budgetRemaining: budget?.remaining ? decStr(budget.remaining) : null,
    attachmentRequired: requirements.some((r) => r.documentType === "REQUEST_ATTACHMENT"),
  };
}

export async function getEditableRequest(user: AuthUser, requestId: string) {
  const req = await db.request.findUnique({ where: { id: requestId }, include: { items: { orderBy: { lineNo: "asc" } } } });
  if (!req || req.requesterId !== user.id) return null;
  return {
    id: req.id,
    status: req.status,
    requestNumber: req.requestNumber,
    lockVersion: req.lockVersion,
    currentVersionNumber: req.currentVersionNumber,
    data: {
      title: req.title === "Pengajuan baru" ? "" : req.title,
      generalReason: req.generalReason,
      requestedPriority: req.requestedPriority,
      neededDate: req.neededDate.toISOString().slice(0, 10),
      items: req.items.map((i) => ({
        id: i.id,
        catalogItemId: i.catalogItemId,
        categoryId: i.categoryId,
        itemName: i.itemName,
        specification: i.specification,
        quantity: i.quantity.toString(),
        unitName: i.unitName,
        estimatedUnitPrice: i.estimatedUnitPrice.toString(),
        reason: i.reason ?? "",
        neededDate: i.neededDate ? i.neededDate.toISOString().slice(0, 10) : "",
      })),
    },
  };
}
