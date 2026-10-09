import "server-only";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/user";
import { can } from "@/server/auth/user";
import { PERMISSIONS } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";
import type { PurchaseOrderStatus } from "@/generated/prisma/enums";
import { dec, decStr, sum } from "@/server/money";
import { PRIORITY } from "@/lib/status";
import { orderByField, pageParams, sortParams, sp, type SearchParams } from "@/lib/list-params";
import { todayDateOnly } from "@/server/time";
import { listDocuments } from "@/server/modules/documents/service";
import { checkDocumentRequirements } from "@/server/modules/documents/requirements";
import { getSettings } from "@/server/settings";

const ACTIVE_PO: PurchaseOrderStatus[] = ["DRAFT", "PENDING_CHANGE_APPROVAL", "READY_TO_ORDER", "ORDERED", "PARTIALLY_RECEIVED", "ON_HOLD", "RECEIVED", "CLOSED"];

export interface QueueItem {
  requestItemId: string;
  itemName: string;
  specification: string;
  unitName: string;
  remaining: string;
  required: string;
  allocated: string;
  estimatedUnitPrice: string;
  categoryName: string | null;
}

export interface QueueRequest {
  requestId: string;
  requestNumber: string | null;
  title: string;
  requester: string;
  department: string;
  priority: keyof typeof PRIORITY;
  neededDate: Date;
  approvedAt: Date | null;
  overdue: boolean;
  items: QueueItem[];
  openPos: Array<{ id: string; poNumber: string; status: PurchaseOrderStatus }>;
}

/** Antrean purchasing: item yang sudah disetujui dan masih punya sisa kebutuhan. */
export async function purchasingQueue(params: SearchParams): Promise<QueueRequest[]> {
  const q = sp(params, "q")?.toLowerCase();
  const departmentId = sp(params, "department");
  const requests = await db.request.findMany({
    where: { status: { in: ["APPROVED", "IN_PROCUREMENT"] }, ...(departmentId ? { departmentId } : {}) },
    include: {
      requester: { select: { fullName: true } },
      department: { select: { name: true } },
      items: {
        orderBy: { lineNo: "asc" },
        include: {
          category: { select: { name: true } },
          purchaseOrderItems: { where: { purchaseOrder: { status: { in: ACTIVE_PO } } }, select: { quantityOrdered: true, closedQuantity: true } },
        },
      },
      purchaseOrderLinks: { include: { purchaseOrder: { select: { id: true, poNumber: true, status: true } } } },
    },
  });
  const today = todayDateOnly();
  const result: QueueRequest[] = [];
  for (const r of requests) {
    const items: QueueItem[] = [];
    for (const it of r.items) {
      const required = dec(it.quantity).minus(it.cancelledQuantity);
      const allocated = sum(it.purchaseOrderItems.map((p) => dec(p.quantityOrdered).minus(p.closedQuantity)));
      const remaining = required.minus(allocated);
      if (remaining.lte(0)) continue;
      items.push({
        requestItemId: it.id,
        itemName: it.itemName,
        specification: it.specification,
        unitName: it.unitName,
        remaining: remaining.toString(),
        required: required.toString(),
        allocated: allocated.toString(),
        estimatedUnitPrice: decStr(it.estimatedUnitPrice),
        categoryName: it.category?.name ?? null,
      });
    }
    if (!items.length) continue;
    if (q && !`${r.requestNumber} ${r.title} ${items.map((i) => i.itemName).join(" ")}`.toLowerCase().includes(q)) continue;
    result.push({
      requestId: r.id,
      requestNumber: r.requestNumber,
      title: r.title,
      requester: r.requester.fullName,
      department: r.department.name,
      priority: r.finalPriority ?? r.requestedPriority,
      neededDate: r.neededDate,
      approvedAt: r.approvedAt,
      overdue: r.neededDate < today,
      items,
      openPos: r.purchaseOrderLinks
        .filter((l) => !["CANCELLED", "CLOSED"].includes(l.purchaseOrder.status))
        .map((l) => l.purchaseOrder),
    });
  }
  // Urutan kerja: prioritas final → tanggal dibutuhkan → posisi antrean (FR-PUR-03).
  result.sort(
    (a, b) =>
      PRIORITY[b.priority].rank - PRIORITY[a.priority].rank ||
      a.neededDate.getTime() - b.neededDate.getTime() ||
      (a.approvedAt?.getTime() ?? 0) - (b.approvedAt?.getTime() ?? 0),
  );
  return result;
}

const PO_TABS: Record<string, Prisma.PurchaseOrderWhereInput> = {
  proses: { status: { in: ["DRAFT", "PENDING_CHANGE_APPROVAL", "READY_TO_ORDER"] } },
  pengiriman: { status: { in: ["ORDERED", "PARTIALLY_RECEIVED", "ON_HOLD"] } },
  diterima: { status: "RECEIVED" },
  selesai: { status: "CLOSED" },
  batal: { status: "CANCELLED" },
};

export async function listPurchaseOrders(params: SearchParams) {
  const { page, pageSize, skip, take } = pageParams(params);
  const { sort, dir } = sortParams(params, ["updatedAt", "currentEta", "totalAmount", "poNumber"] as const, "updatedAt");
  const tab = sp(params, "tab");
  const status = sp(params, "status") as PurchaseOrderStatus | undefined;
  const vendorId = sp(params, "vendor");
  const q = sp(params, "q");
  const today = todayDateOnly();
  const contains = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const where: Prisma.PurchaseOrderWhereInput = {
    ...(tab && PO_TABS[tab] ? PO_TABS[tab] : {}),
    ...(tab === "terlambat" ? { status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] }, currentEta: { lt: today } } : {}),
    ...(status ? { status } : {}),
    ...(vendorId ? { vendorId } : {}),
    ...(sp(params, "review") ? { needsReviewAt: { not: null } } : {}),
    ...(contains
      ? { OR: [{ poNumber: contains }, { title: contains }, { vendor: { name: contains } }, { requestLinks: { some: { request: { requestNumber: contains } } } }] }
      : {}),
  };
  const [rows, total, groups, late] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      include: {
        vendor: { select: { name: true } },
        purchasingOwner: { select: { fullName: true } },
        requestLinks: { select: { request: { select: { requestNumber: true } } } },
        _count: { select: { items: true } },
      },
      orderBy: orderByField(sort, dir, ["currentEta"]),
      skip,
      take,
    }),
    db.purchaseOrder.count({ where }),
    db.purchaseOrder.groupBy({ by: ["status"], _count: true }),
    db.purchaseOrder.count({ where: { status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] }, currentEta: { lt: today } } }),
  ]);
  const count = (s: PurchaseOrderStatus[]) => groups.filter((g) => s.includes(g.status)).reduce((a, g) => a + g._count, 0);
  return {
    rows: rows.map((p) => ({
      id: p.id,
      poNumber: p.poNumber,
      title: p.title,
      status: p.status,
      vendor: p.vendor?.name ?? null,
      owner: p.purchasingOwner.fullName,
      totalAmount: decStr(p.totalAmount),
      currentEta: p.currentEta,
      overdue: !!p.currentEta && p.currentEta < today && ["ORDERED", "PARTIALLY_RECEIVED"].includes(p.status),
      needsReview: !!p.needsReviewAt,
      requestNumbers: p.requestLinks.map((l) => l.request.requestNumber).filter(Boolean) as string[],
      itemCount: p._count.items,
      updatedAt: p.updatedAt,
    })),
    total,
    page,
    pageSize,
    tabCounts: {
      semua: groups.reduce((a, g) => a + g._count, 0),
      proses: count(["DRAFT", "PENDING_CHANGE_APPROVAL", "READY_TO_ORDER"]),
      pengiriman: count(["ORDERED", "PARTIALLY_RECEIVED", "ON_HOLD"]),
      terlambat: late,
      diterima: count(["RECEIVED"]),
      selesai: count(["CLOSED"]),
      batal: count(["CANCELLED"]),
    },
  };
}

export async function getPurchaseOrderDetail(user: AuthUser, poId: string) {
  const po = await db.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      vendor: true,
      purchasingOwner: { select: { fullName: true, id: true } },
      cancelledBy: { select: { fullName: true } },
      replaces: { select: { id: true, poNumber: true } },
      replacements: { select: { id: true, poNumber: true, status: true } },
      items: {
        orderBy: { lineNo: "asc" },
        include: {
          requestItem: { include: { request: { select: { id: true, requestNumber: true, title: true, requester: { select: { fullName: true } } } } } },
          receiptItems: true,
          changeItems: { include: { changeRequest: { select: { status: true } } } },
        },
      },
      requestLinks: {
        include: {
          request: {
            select: { id: true, requestNumber: true, title: true, status: true, neededDate: true, requester: { select: { fullName: true } }, department: { select: { name: true } } },
          },
        },
      },
      quotes: { include: { vendor: { select: { name: true } }, createdBy: { select: { fullName: true } } }, orderBy: { createdAt: "asc" } },
      statusHistory: { orderBy: { changedAt: "asc" }, include: { changedBy: { select: { fullName: true } } } },
      followups: { orderBy: { createdAt: "desc" }, include: { responsibleUser: { select: { fullName: true } }, createdBy: { select: { fullName: true } } } },
      changeRequests: {
        orderBy: { createdAt: "desc" },
        include: { request: { select: { requestNumber: true, id: true } }, items: true, createdBy: { select: { fullName: true } } },
      },
      receipts: {
        orderBy: { receivedAt: "desc" },
        include: { receivedBy: { select: { fullName: true } }, items: { include: { purchaseOrderItem: { select: { itemName: true, unitName: true } } } } },
      },
      discrepancies: {
        orderBy: { reportedAt: "desc" },
        include: {
          purchaseOrderItem: { select: { itemName: true, unitName: true } },
          reportedBy: { select: { fullName: true } },
          resolvedBy: { select: { fullName: true } },
          replacementPo: { select: { id: true, poNumber: true } },
        },
      },
      comments: { orderBy: { createdAt: "desc" }, include: { author: { select: { fullName: true } } } },
    },
  });
  if (!po) return null;
  const settings = await getSettings();
  const tolerance = settings["purchasing.price_tolerance_percent"];

  const lines = po.items.map((l) => {
    const accepted = sum(l.receiptItems.map((r) => r.quantityAccepted));
    const rejected = sum(l.receiptItems.map((r) => r.quantityRejected));
    const outstanding = dec(l.quantityOrdered).minus(l.closedQuantity).minus(accepted);
    const est = dec(l.requestItem.estimatedUnitPrice);
    const priceDiff = dec(l.unitPrice).minus(est);
    const priceApproved = l.changeItems.some((c) => c.changeType === "PRICE" && c.changeRequest.status === "APPROVED" && c.newUnitPrice?.eq(l.unitPrice));
    const priceChanged = priceDiff.abs().gt(est.times(tolerance).dividedBy(100));
    return {
      id: l.id,
      lineNo: l.lineNo,
      requestItemId: l.requestItemId,
      request: l.requestItem.request,
      itemName: l.itemName,
      specification: l.specification,
      specChanged: l.specification.trim() !== l.requestItem.specification.trim(),
      unitName: l.unitName,
      quantityOrdered: decStr(l.quantityOrdered),
      closedQuantity: decStr(l.closedQuantity),
      accepted: decStr(accepted),
      rejected: decStr(rejected),
      outstanding: decStr(outstanding.gt(0) ? outstanding : 0),
      unitPrice: decStr(l.unitPrice),
      lineTotal: decStr(l.lineTotal),
      estimatedUnitPrice: decStr(est),
      priceChanged,
      priceApproved,
      requiredQty: decStr(dec(l.requestItem.quantity).minus(l.requestItem.cancelledQuantity)),
    };
  });

  const [poDocs, quoteDocs, receiptDocs, discrepancyDocs] = await Promise.all([
    listDocuments(user, "po", po.id),
    Promise.all(po.quotes.map(async (q) => [q.id, await listDocuments(user, "quote", q.id)] as const)),
    Promise.all(po.receipts.map(async (r) => [r.id, await listDocuments(user, "receipt", r.id)] as const)),
    Promise.all(po.discrepancies.map(async (d) => [d.id, await listDocuments(user, "discrepancy", d.id)] as const)),
  ]);
  const orderChecks = await checkDocumentRequirements(db, "PO_ORDER", { purchaseOrderId: po.id, amount: po.totalAmount });
  const closeChecks = await checkDocumentRequirements(db, "PO_CLOSE", { purchaseOrderId: po.id, amount: po.totalAmount });

  const editable = po.status === "DRAFT" || po.status === "READY_TO_ORDER";
  const shipping = ["ORDERED", "PARTIALLY_RECEIVED", "ON_HOLD"].includes(po.status);
  const today = todayDateOnly();
  const canClose = po.status === "RECEIVED" && po.requestLinks.every((l) => ["COMPLETED", "CANCELLED"].includes(l.request.status));
  const purchasingUsers = await db.user.findMany({
    where: { accountStatus: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { code: PERMISSIONS.PURCHASING_MANAGE } } } } } } },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });

  return {
    po: {
      id: po.id,
      poNumber: po.poNumber,
      title: po.title,
      notes: po.notes,
      status: po.status,
      vendorId: po.vendorId,
      vendor: po.vendor ? { id: po.vendor.id, name: po.vendor.name, contactPerson: po.vendor.contactPerson, phone: po.vendor.phone, email: po.vendor.email } : null,
      owner: po.purchasingOwner,
      vendorReference: po.vendorReference,
      orderedAt: po.orderedAt,
      expectedDeliveryDate: po.expectedDeliveryDate,
      currentEta: po.currentEta,
      overdue: !!po.currentEta && po.currentEta < today && ["ORDERED", "PARTIALLY_RECEIVED"].includes(po.status),
      totalAmount: decStr(po.totalAmount),
      holdReason: po.holdReason,
      needsReviewAt: po.needsReviewAt,
      lockVersion: po.lockVersion,
      cancellationReason: po.cancellationReason,
      cancelledBy: po.cancelledBy?.fullName ?? null,
      cancelledAt: po.cancelledAt,
      closedAt: po.closedAt,
      receivedAt: po.receivedAt,
      createdAt: po.createdAt,
      replaces: po.replaces,
      replacements: po.replacements,
    },
    lines,
    requests: po.requestLinks.map((l) => l.request),
    quotes: po.quotes.map((q) => ({
      id: q.id,
      vendorId: q.vendorId,
      vendor: q.vendor.name,
      quoteNumber: q.quoteNumber,
      quoteDate: q.quoteDate,
      validUntil: q.validUntil,
      totalAmount: decStr(q.totalAmount),
      isSelected: q.isSelected,
      selectionNote: q.selectionNote,
      notes: q.notes,
      createdBy: q.createdBy.fullName,
      documents: (quoteDocs.find(([id]) => id === q.id)?.[1] ?? []).map((d) => ({ ...d, canDelete: editable })),
    })),
    statusHistory: po.statusHistory.map((h) => ({ id: h.id, from: h.fromStatus, to: h.toStatus, at: h.changedAt, by: h.changedBy?.fullName ?? "Sistem", reason: h.reason })),
    followups: po.followups.map((f) => ({
      id: f.id,
      type: f.followupType,
      reason: f.reason,
      previousEta: f.previousEta,
      newEta: f.newEta,
      actionTaken: f.actionTaken,
      actionDate: f.actionDate,
      responsible: f.responsibleUser.fullName,
      vendorResponse: f.vendorResponse,
      targetResolutionDate: f.targetResolutionDate,
      createdBy: f.createdBy.fullName,
      createdAt: f.createdAt,
    })),
    changeRequests: po.changeRequests.map((c) => ({
      id: c.id,
      status: c.status,
      reason: c.reason,
      requestNumber: c.request.requestNumber,
      requestId: c.request.id,
      createdBy: c.createdBy.fullName,
      createdAt: c.createdAt,
      types: [...new Set(c.items.map((i) => i.changeType))],
    })),
    receipts: po.receipts.map((r) => ({
      id: r.id,
      receiptNumber: r.receiptNumber,
      receivedAt: r.receivedAt,
      receivedBy: r.receivedBy.fullName,
      deliveryNoteNumber: r.deliveryNoteNumber,
      notes: r.notes,
      items: r.items.map((i) => ({
        id: i.id,
        itemName: i.purchaseOrderItem.itemName,
        unitName: i.purchaseOrderItem.unitName,
        received: decStr(i.quantityReceived),
        accepted: decStr(i.quantityAccepted),
        rejected: decStr(i.quantityRejected),
        condition: i.condition,
        notes: i.notes,
      })),
      documents: (receiptDocs.find(([id]) => id === r.id)?.[1] ?? []).map((d) => ({ ...d, canDelete: true })),
    })),
    discrepancies: po.discrepancies.map((d) => ({
      id: d.id,
      type: d.type,
      status: d.status,
      quantity: decStr(d.quantity),
      description: d.description,
      itemName: d.purchaseOrderItem.itemName,
      unitName: d.purchaseOrderItem.unitName,
      resolutionType: d.resolutionType,
      resolutionNote: d.resolutionNote,
      reportedBy: d.reportedBy.fullName,
      reportedAt: d.reportedAt,
      resolvedBy: d.resolvedBy?.fullName ?? null,
      resolvedAt: d.resolvedAt,
      replacementPo: d.replacementPo,
      documents: (discrepancyDocs.find(([id]) => id === d.id)?.[1] ?? []).map((doc) => ({ ...doc, canDelete: d.status !== "RESOLVED" })),
    })),
    comments: po.comments.map((c) => ({ id: c.id, body: c.body, author: c.author.fullName, createdAt: c.createdAt })),
    documents: poDocs.map((d) => ({ ...d, canDelete: !["CLOSED", "CANCELLED"].includes(po.status) })),
    orderChecks: orderChecks.filter((c) => !(po.replacesPurchaseOrderId && c.documentType === "VENDOR_QUOTE")),
    closeChecks,
    flags: {
      editable,
      shipping,
      canMarkReady: po.status === "DRAFT",
      canRevert: po.status === "PENDING_CHANGE_APPROVAL" || po.status === "READY_TO_ORDER",
      canOrder: po.status === "READY_TO_ORDER",
      canReceive: shipping,
      canClose,
      canCancel:
        ["DRAFT", "PENDING_CHANGE_APPROVAL", "READY_TO_ORDER"].includes(po.status) ||
        (shipping && can(user, PERMISSIONS.PO_CANCEL_AFTER_ORDER) && !lines.some((l) => Number(l.accepted) > 0)),
      hasUnapprovedChanges: lines.some((l) => (l.priceChanged && !l.priceApproved) || l.specChanged || Number(l.quantityOrdered) > Number(l.requiredQty)),
    },
    purchasingUsers,
  };
}

export type PoDetail = NonNullable<Awaited<ReturnType<typeof getPurchaseOrderDetail>>>;

export async function vendorOptions() {
  return db.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}
