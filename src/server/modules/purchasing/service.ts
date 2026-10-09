import type { Tx } from "@/server/db";
import type { ActorContext } from "@/server/context";
import type { ChangeType, FollowupType, PurchaseOrderStatus } from "@/generated/prisma/enums";
import { audit } from "@/server/audit";
import { transaction, withIdempotency } from "@/server/idempotency";
import { DOC_PREFIX, nextNumber } from "@/server/numbering";
import { dec, lineTotal, sum, type Decimal } from "@/server/money";
import { dateOnly } from "@/server/time";
import { getSettings } from "@/server/settings";
import { notify } from "@/server/notifications/notify";
import { can } from "@/server/auth/user";
import { PERMISSIONS } from "@/lib/permissions";
import { PO_STATUS } from "@/lib/status";
import { ConflictError, ForbiddenError, NotFoundError, RuleError, ValidationError } from "@/server/errors";
import { cancelApproval, findActiveInstance, startApproval } from "@/server/modules/approvals/engine";
import { checkDocumentRequirements, unmetMessages } from "@/server/modules/documents/requirements";
import { itemFulfilment, syncRequestProcurement } from "@/server/modules/requests/service";

function requirePurchasing(ctx: ActorContext) {
  if (!can(ctx.user, PERMISSIONS.PURCHASING_MANAGE)) throw new ForbiddenError("Hanya Purchasing yang dapat melakukan tindakan ini.");
}

// ---------------------------------------------------------------------------
// Status PO
// ---------------------------------------------------------------------------

const PO_ALLOWED: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT: ["PENDING_CHANGE_APPROVAL", "READY_TO_ORDER", "CANCELLED"],
  PENDING_CHANGE_APPROVAL: ["READY_TO_ORDER", "DRAFT", "CANCELLED"],
  READY_TO_ORDER: ["ORDERED", "DRAFT", "CANCELLED"],
  ORDERED: ["PARTIALLY_RECEIVED", "ON_HOLD", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["ON_HOLD", "RECEIVED", "ORDERED"],
  ON_HOLD: ["PARTIALLY_RECEIVED", "RECEIVED", "ORDERED", "CANCELLED"],
  RECEIVED: ["CLOSED", "ON_HOLD", "PARTIALLY_RECEIVED"],
  CLOSED: [],
  CANCELLED: [],
};

export async function setPoStatus(
  tx: Tx,
  ctx: ActorContext | null,
  poId: string,
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
  reason?: string | null,
  extra: Record<string, unknown> = {},
) {
  if (from === to) return;
  if (!PO_ALLOWED[from].includes(to)) {
    throw new RuleError(`Status PO tidak dapat berubah dari "${PO_STATUS[from].label}" ke "${PO_STATUS[to].label}".`);
  }
  const now = new Date();
  const res = await tx.purchaseOrder.updateMany({
    where: { id: poId, status: from },
    data: { status: to, lastActivityAt: now, needsReviewAt: null, lockVersion: { increment: 1 }, ...extra },
  });
  if (res.count === 0) throw new ConflictError();
  await tx.purchaseOrderStatusHistory.create({
    data: { purchaseOrderId: poId, fromStatus: from, toStatus: to, changedById: ctx?.user.id ?? null, reason: reason ?? null },
  });
}

async function recomputeTotal(tx: Tx, poId: string): Promise<Decimal> {
  const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: poId }, select: { lineTotal: true } });
  const total = sum(items.map((i) => i.lineTotal));
  await tx.purchaseOrder.update({ where: { id: poId }, data: { totalAmount: total } });
  return total;
}

async function relinkRequests(tx: Tx, ctx: ActorContext, poId: string) {
  const lines = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId: poId },
    select: { requestItem: { select: { requestId: true } } },
  });
  const requestIds = new Set(lines.map((l) => l.requestItem.requestId));
  const links = await tx.purchaseOrderRequest.findMany({ where: { purchaseOrderId: poId } });
  for (const link of links) {
    if (!requestIds.has(link.requestId)) await tx.purchaseOrderRequest.delete({ where: { id: link.id } });
  }
  for (const requestId of requestIds) {
    if (!links.some((l) => l.requestId === requestId)) {
      await tx.purchaseOrderRequest.create({ data: { purchaseOrderId: poId, requestId, linkedById: ctx.user.id } });
    }
  }
  return [...new Set([...requestIds, ...links.map((l) => l.requestId)])];
}

async function loadPo(tx: Tx, poId: string) {
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) throw new NotFoundError("PO tidak ditemukan.");
  return po;
}

// ---------------------------------------------------------------------------
// Membuat & mengubah PO
// ---------------------------------------------------------------------------

export interface PoLineInput {
  id?: string;
  requestItemId: string;
  quantity: string | number;
  unitPrice?: string | number | null;
  specification?: string | null;
}

async function validateQueueItems(tx: Tx, requestItemIds: string[]) {
  const items = await tx.requestItem.findMany({
    where: { id: { in: requestItemIds } },
    include: { request: { select: { id: true, status: true, requestNumber: true } } },
  });
  if (items.length !== new Set(requestItemIds).size) throw new ValidationError("Sebagian item tidak ditemukan.");
  for (const it of items) {
    if (!["APPROVED", "IN_PROCUREMENT"].includes(it.request.status)) {
      throw new RuleError(`Item "${it.itemName}" (${it.request.requestNumber}) tidak berada di antrean purchasing.`);
    }
  }
  return items;
}

export async function createPurchaseOrder(
  ctx: ActorContext,
  input: { lines: PoLineInput[]; vendorId?: string | null; title?: string | null; notes?: string | null },
  idempotencyKey?: string,
) {
  requirePurchasing(ctx);
  if (!input.lines.length) throw new ValidationError("Pilih minimal satu item dari antrean.");
  return withIdempotency(ctx.user.id, idempotencyKey, "po.create", async (tx) => {
    const items = await validateQueueItems(
      tx,
      input.lines.map((l) => l.requestItemId),
    );
    const poNumber = await nextNumber(tx, DOC_PREFIX.PURCHASE_ORDER);
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber,
        vendorId: input.vendorId || null,
        purchasingOwnerId: ctx.user.id,
        title: input.title?.trim() || null,
        notes: input.notes?.trim() || null,
      },
    });
    let lineNo = 1;
    for (const line of input.lines) {
      const ri = items.find((i) => i.id === line.requestItemId)!;
      const qty = dec(line.quantity);
      if (qty.lte(0)) throw new ValidationError(`Jumlah untuk "${ri.itemName}" harus lebih dari 0.`);
      const price = line.unitPrice !== undefined && line.unitPrice !== null && line.unitPrice !== "" ? dec(line.unitPrice) : dec(ri.estimatedUnitPrice);
      if (price.lt(0)) throw new ValidationError("Harga tidak boleh negatif.");
      await tx.purchaseOrderItem.create({
        data: {
          purchaseOrderId: po.id,
          requestItemId: ri.id,
          lineNo: lineNo++,
          itemName: ri.itemName,
          specification: line.specification?.trim() || ri.specification,
          unitName: ri.unitName,
          quantityOrdered: qty,
          unitPrice: price,
          lineTotal: lineTotal(qty, price),
        },
      });
    }
    await recomputeTotal(tx, po.id);
    const requestIds = await relinkRequests(tx, ctx, po.id);
    await tx.purchaseOrderStatusHistory.create({
      data: { purchaseOrderId: po.id, fromStatus: null, toStatus: "DRAFT", changedById: ctx.user.id, reason: "PO dibuat" },
    });
    for (const rid of requestIds) await syncRequestProcurement(tx, ctx, rid);
    await audit(tx, ctx, {
      action: "po.create",
      entityType: "purchase_order",
      entityId: po.id,
      newValues: { poNumber, lines: input.lines.length, requests: requestIds.length },
    });
    return { id: po.id, poNumber };
  });
}

export async function updatePurchaseOrder(
  ctx: ActorContext,
  poId: string,
  input: {
    lockVersion: number;
    vendorId?: string | null;
    title?: string | null;
    notes?: string | null;
    vendorReference?: string | null;
    expectedDeliveryDate?: string | null;
    lines: PoLineInput[];
  },
) {
  requirePurchasing(ctx);
  return transaction(async (tx) => {
    const po = await loadPo(tx, poId);
    if (po.lockVersion !== input.lockVersion) throw new ConflictError();
    if (po.status !== "DRAFT" && po.status !== "READY_TO_ORDER") {
      throw new RuleError("PO hanya dapat diubah saat berstatus Draf atau Siap Dipesan.");
    }
    if (!input.lines.length) throw new ValidationError("PO harus memiliki minimal satu baris. Batalkan PO jika tidak diperlukan.");
    const existing = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: poId } });
    const newItemIds = input.lines.filter((l) => !l.id).map((l) => l.requestItemId);
    const newItems = newItemIds.length ? await validateQueueItems(tx, newItemIds) : [];

    const keepIds = new Set(input.lines.filter((l) => l.id).map((l) => l.id!));
    const removed = existing.filter((e) => !keepIds.has(e.id));
    if (removed.length) await tx.purchaseOrderItem.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });

    let lineNo = 1;
    for (const line of input.lines) {
      const qty = dec(line.quantity);
      if (qty.lte(0)) throw new ValidationError("Jumlah harus lebih dari 0.");
      const price = dec(line.unitPrice ?? 0);
      if (price.lt(0)) throw new ValidationError("Harga tidak boleh negatif.");
      if (line.id) {
        const cur = existing.find((e) => e.id === line.id);
        if (!cur) throw new ValidationError("Baris PO tidak valid.");
        await tx.purchaseOrderItem.update({
          where: { id: line.id },
          data: {
            lineNo: lineNo++,
            quantityOrdered: qty,
            unitPrice: price,
            lineTotal: lineTotal(qty, price),
            specification: line.specification?.trim() || cur.specification,
          },
        });
      } else {
        const ri = newItems.find((i) => i.id === line.requestItemId)!;
        const p = line.unitPrice !== undefined && line.unitPrice !== null && line.unitPrice !== "" ? price : dec(ri.estimatedUnitPrice);
        await tx.purchaseOrderItem.create({
          data: {
            purchaseOrderId: poId,
            requestItemId: ri.id,
            lineNo: lineNo++,
            itemName: ri.itemName,
            specification: line.specification?.trim() || ri.specification,
            unitName: ri.unitName,
            quantityOrdered: qty,
            unitPrice: p,
            lineTotal: lineTotal(qty, p),
          },
        });
      }
    }
    await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        vendorId: input.vendorId || null,
        title: input.title?.trim() || null,
        notes: input.notes?.trim() || null,
        vendorReference: input.vendorReference?.trim() || null,
        expectedDeliveryDate: input.expectedDeliveryDate ? dateOnly(input.expectedDeliveryDate) : null,
        lastActivityAt: new Date(),
        lockVersion: { increment: 1 },
        holdReason: null,
      },
    });
    const total = await recomputeTotal(tx, poId);
    const requestIds = await relinkRequests(tx, ctx, poId);
    if (po.status === "READY_TO_ORDER") await setPoStatus(tx, ctx, poId, "READY_TO_ORDER", "DRAFT", "PO diubah");
    for (const rid of requestIds) await syncRequestProcurement(tx, ctx, rid);
    await audit(tx, ctx, {
      action: "po.update",
      entityType: "purchase_order",
      entityId: poId,
      oldValues: { total: po.totalAmount.toString(), vendorId: po.vendorId },
      newValues: { total: total.toString(), vendorId: input.vendorId, lines: input.lines.length },
    });
    return { id: poId };
  });
}

// ---------------------------------------------------------------------------
// Penawaran vendor
// ---------------------------------------------------------------------------

export async function addQuote(
  ctx: ActorContext,
  poId: string,
  input: { vendorId: string; quoteNumber?: string | null; quoteDate: string; validUntil?: string | null; totalAmount: string | number; notes?: string | null },
) {
  requirePurchasing(ctx);
  return transaction(async (tx) => {
    const po = await loadPo(tx, poId);
    if (!["DRAFT", "READY_TO_ORDER", "PENDING_CHANGE_APPROVAL"].includes(po.status)) {
      throw new RuleError("Penawaran hanya dapat ditambahkan sebelum PO dipesan.");
    }
    const amount = dec(input.totalAmount);
    if (amount.lt(0)) throw new ValidationError("Nilai penawaran tidak boleh negatif.");
    const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId } });
    if (!vendor || !vendor.isActive) throw new ValidationError("Vendor tidak valid atau nonaktif.");
    const quote = await tx.vendorQuote.create({
      data: {
        purchaseOrderId: poId,
        vendorId: input.vendorId,
        quoteNumber: input.quoteNumber?.trim() || null,
        quoteDate: dateOnly(input.quoteDate),
        validUntil: input.validUntil ? dateOnly(input.validUntil) : null,
        totalAmount: amount,
        notes: input.notes?.trim() || null,
        createdById: ctx.user.id,
      },
    });
    await tx.purchaseOrder.update({ where: { id: poId }, data: { lastActivityAt: new Date() } });
    await audit(tx, ctx, { action: "po.quote_add", entityType: "purchase_order", entityId: poId, newValues: { quoteId: quote.id, vendor: vendor.name, amount: amount.toString() } });
    return { id: quote.id };
  });
}

export async function selectQuote(ctx: ActorContext, quoteId: string, note?: string | null) {
  requirePurchasing(ctx);
  return transaction(async (tx) => {
    const quote = await tx.vendorQuote.findUnique({ where: { id: quoteId }, include: { purchaseOrder: true } });
    if (!quote) throw new NotFoundError();
    if (!["DRAFT", "READY_TO_ORDER"].includes(quote.purchaseOrder.status)) throw new RuleError("Penawaran tidak dapat dipilih pada status PO ini.");
    await tx.vendorQuote.updateMany({ where: { purchaseOrderId: quote.purchaseOrderId }, data: { isSelected: false, selectionNote: null } });
    await tx.vendorQuote.update({ where: { id: quoteId }, data: { isSelected: true, selectionNote: note?.trim() || null } });
    await tx.purchaseOrder.update({ where: { id: quote.purchaseOrderId }, data: { vendorId: quote.vendorId, lastActivityAt: new Date() } });
    await audit(tx, ctx, { action: "po.quote_select", entityType: "purchase_order", entityId: quote.purchaseOrderId, newValues: { quoteId, note } });
  });
}

export async function deleteQuote(ctx: ActorContext, quoteId: string) {
  requirePurchasing(ctx);
  return transaction(async (tx) => {
    const quote = await tx.vendorQuote.findUnique({ where: { id: quoteId }, include: { purchaseOrder: true, documents: true } });
    if (!quote) throw new NotFoundError();
    if (!["DRAFT", "READY_TO_ORDER"].includes(quote.purchaseOrder.status)) throw new RuleError("Penawaran tidak dapat dihapus pada status PO ini.");
    if (quote.documents.some((d) => !d.deletedAt && d.uploadStatus === "READY")) {
      throw new RuleError("Hapus dokumen penawaran terlebih dahulu.");
    }
    await tx.document.deleteMany({ where: { vendorQuoteId: quoteId, uploadStatus: "PENDING" } });
    await tx.vendorQuote.delete({ where: { id: quoteId } });
    await audit(tx, ctx, { action: "po.quote_delete", entityType: "purchase_order", entityId: quote.purchaseOrderId, oldValues: { quoteId } });
  });
}

// ---------------------------------------------------------------------------
// Deteksi perubahan & persetujuan ulang
// ---------------------------------------------------------------------------

interface DetectedChange {
  requestId: string;
  requestItemId: string;
  purchaseOrderItemId: string | null;
  changeType: ChangeType;
  oldUnitPrice?: Decimal;
  newUnitPrice?: Decimal;
  oldQuantity?: Decimal;
  newQuantity?: Decimal;
  oldSpecification?: string;
  newSpecification?: string;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Perubahan pada PO yang belum memiliki persetujuan. */
async function detectUnapprovedChanges(tx: Tx, poId: string): Promise<DetectedChange[]> {
  const settings = await getSettings();
  const tolerance = dec(settings["purchasing.price_tolerance_percent"]);
  const lines = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId: poId },
    include: { requestItem: true },
    orderBy: { lineNo: "asc" },
  });
  const changes: DetectedChange[] = [];
  const checkedQty = new Set<string>();
  for (const line of lines) {
    const ri = line.requestItem;
    // Harga
    const est = dec(ri.estimatedUnitPrice);
    const diff = dec(line.unitPrice).minus(est).abs();
    const allowed = est.times(tolerance).dividedBy(100);
    if (diff.gt(allowed)) {
      const approved = await tx.changeRequestItem.count({
        where: { requestItemId: ri.id, changeType: "PRICE", newUnitPrice: line.unitPrice, changeRequest: { status: "APPROVED" } },
      });
      if (!approved) {
        changes.push({
          requestId: ri.requestId,
          requestItemId: ri.id,
          purchaseOrderItemId: line.id,
          changeType: "PRICE",
          oldUnitPrice: est,
          newUnitPrice: dec(line.unitPrice),
        });
      }
    }
    // Spesifikasi
    if (norm(line.specification) !== norm(ri.specification)) {
      changes.push({
        requestId: ri.requestId,
        requestItemId: ri.id,
        purchaseOrderItemId: line.id,
        changeType: "SPECIFICATION",
        oldSpecification: ri.specification,
        newSpecification: line.specification,
      });
    }
    // Kuantitas (total semua PO aktif untuk item ini)
    if (!checkedQty.has(ri.id)) {
      checkedQty.add(ri.id);
      const [f] = (await itemFulfilment(tx, ri.requestId)).filter((x) => x.requestItemId === ri.id);
      if (f && f.allocated.gt(f.required)) {
        changes.push({
          requestId: ri.requestId,
          requestItemId: ri.id,
          purchaseOrderItemId: line.id,
          changeType: "QUANTITY",
          oldQuantity: dec(ri.quantity),
          newQuantity: dec(ri.cancelledQuantity).plus(f.allocated),
        });
      }
    }
  }
  return changes;
}

async function cancelPendingChangeRequests(tx: Tx, poId: string, note: string) {
  const pending = await tx.changeRequest.findMany({ where: { purchaseOrderId: poId, status: "PENDING" } });
  for (const cr of pending) {
    const inst = await findActiveInstance(tx, { requestId: cr.requestId, subjectType: "CHANGE_REQUEST", changeRequestId: cr.id });
    if (inst) await cancelApproval(tx, inst.id, note);
    await tx.changeRequest.update({ where: { id: cr.id }, data: { status: "CANCELLED", decidedAt: new Date() } });
  }
}

/**
 * Menandai PO siap dipesan. Jika harga aktual/kuantitas/spesifikasi berbeda dari
 * yang disetujui, sistem membuat permintaan perubahan per pengajuan dan meminta
 * persetujuan pemohon + atasan pemohon (FR-CHG-02..04, FR-PUR-10).
 */
export async function markReady(ctx: ActorContext, poId: string, reason?: string | null) {
  requirePurchasing(ctx);
  return transaction(async (tx) => {
    const po = await loadPo(tx, poId);
    if (po.status !== "DRAFT") throw new RuleError("Hanya PO berstatus Draf yang dapat ditandai siap.");
    if (!po.vendorId) throw new ValidationError("Pilih vendor terlebih dahulu.");
    const lineCount = await tx.purchaseOrderItem.count({ where: { purchaseOrderId: poId } });
    if (!lineCount) throw new ValidationError("PO belum memiliki baris.");

    const changes = await detectUnapprovedChanges(tx, poId);
    if (changes.length === 0) {
      await setPoStatus(tx, ctx, poId, "DRAFT", "READY_TO_ORDER", "Siap dipesan", { holdReason: null });
      await audit(tx, ctx, { action: "po.ready", entityType: "purchase_order", entityId: poId });
      return { status: "READY_TO_ORDER" as const, changeRequests: 0 };
    }
    if (!reason?.trim()) {
      throw new ValidationError("Ada perubahan dari pengajuan. Isi alasan perubahan untuk diajukan persetujuan.", {
        reason: "Alasan perubahan wajib diisi",
      });
    }
    await cancelPendingChangeRequests(tx, poId, "Digantikan permintaan perubahan baru.");
    const byRequest = new Map<string, DetectedChange[]>();
    for (const c of changes) byRequest.set(c.requestId, [...(byRequest.get(c.requestId) ?? []), c]);

    const holds: string[] = [];
    for (const [requestId, list] of byRequest) {
      const cr = await tx.changeRequest.create({
        data: {
          requestId,
          purchaseOrderId: poId,
          reason: reason.trim(),
          createdById: ctx.user.id,
          items: {
            create: list.map((c) => ({
              requestItemId: c.requestItemId,
              purchaseOrderItemId: c.purchaseOrderItemId,
              changeType: c.changeType,
              oldUnitPrice: c.oldUnitPrice,
              newUnitPrice: c.newUnitPrice,
              oldQuantity: c.oldQuantity,
              newQuantity: c.newQuantity,
              oldSpecification: c.oldSpecification,
              newSpecification: c.newSpecification,
            })),
          },
        },
      });
      const lines = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: poId, requestItem: { requestId } },
        select: { lineTotal: true },
      });
      const started = await startApproval(tx, ctx, {
        subjectType: "CHANGE_REQUEST",
        requestId,
        changeRequestId: cr.id,
        amount: sum(lines.map((l) => l.lineTotal)),
        initiatorId: ctx.user.id,
      });
      if (started.status === "ON_HOLD") holds.push(started.holdReason ?? "Jalur persetujuan perubahan tidak dapat ditentukan.");
      if (started.status === "APPROVED") await applyApprovedChange(tx, ctx, cr.id);
    }
    const pending = await tx.changeRequest.count({ where: { purchaseOrderId: poId, status: "PENDING" } });
    if (pending > 0) {
      await setPoStatus(tx, ctx, poId, "DRAFT", "PENDING_CHANGE_APPROVAL", "Menunggu persetujuan perubahan", {
        holdReason: holds.length ? holds.join(" ") : null,
      });
    } else {
      await setPoStatus(tx, ctx, poId, "DRAFT", "READY_TO_ORDER", "Perubahan disetujui");
    }
    await audit(tx, ctx, {
      action: "po.change_requested",
      entityType: "purchase_order",
      entityId: poId,
      newValues: { changes: changes.map((c) => c.changeType), requests: byRequest.size },
      reason,
    });
    return { status: pending > 0 ? ("PENDING_CHANGE_APPROVAL" as const) : ("READY_TO_ORDER" as const), changeRequests: byRequest.size, holds };
  });
}

/** Menerapkan perubahan yang disetujui ke item pengajuan. */
async function applyApprovedChange(tx: Tx, ctx: ActorContext, changeRequestId: string) {
  const cr = await tx.changeRequest.findUniqueOrThrow({ where: { id: changeRequestId }, include: { items: true } });
  await tx.changeRequest.update({ where: { id: cr.id }, data: { status: "APPROVED", decidedAt: new Date() } });
  for (const item of cr.items) {
    if (item.changeType === "QUANTITY" && item.newQuantity) {
      await tx.requestItem.update({ where: { id: item.requestItemId }, data: { quantity: item.newQuantity } });
    }
    if (item.changeType === "SPECIFICATION" && item.newSpecification) {
      await tx.requestItem.update({ where: { id: item.requestItemId }, data: { specification: item.newSpecification } });
    }
  }
  await audit(tx, ctx, {
    action: "change_request.approved",
    entityType: "change_request",
    entityId: cr.id,
    newValues: cr.items.map((i) => ({
      type: i.changeType,
      oldPrice: i.oldUnitPrice?.toString(),
      newPrice: i.newUnitPrice?.toString(),
      oldQty: i.oldQuantity?.toString(),
      newQty: i.newQuantity?.toString(),
    })),
  });
}

export async function onChangeApproved(tx: Tx, ctx: ActorContext, changeRequestId: string) {
  await applyApprovedChange(tx, ctx, changeRequestId);
  const cr = await tx.changeRequest.findUniqueOrThrow({ where: { id: changeRequestId }, include: { purchaseOrder: true, request: true } });
  await syncRequestProcurement(tx, ctx, cr.requestId);
  if (!cr.purchaseOrder) return;
  const po = cr.purchaseOrder;
  const pending = await tx.changeRequest.count({ where: { purchaseOrderId: po.id, status: "PENDING" } });
  if (pending === 0 && po.status === "PENDING_CHANGE_APPROVAL") {
    const remaining = await detectUnapprovedChanges(tx, po.id);
    if (remaining.length === 0) {
      await setPoStatus(tx, ctx, po.id, "PENDING_CHANGE_APPROVAL", "READY_TO_ORDER", "Semua perubahan disetujui", { holdReason: null });
    } else {
      await setPoStatus(tx, ctx, po.id, "PENDING_CHANGE_APPROVAL", "DRAFT", "Masih ada perubahan yang belum disetujui");
    }
  }
  await notify(tx, {
    recipientIds: [po.purchasingOwnerId],
    type: "CHANGE_DECIDED",
    title: `Perubahan disetujui: ${po.poNumber} / ${cr.request.requestNumber}`,
    body: pending === 0 ? "Semua perubahan disetujui. PO dapat dilanjutkan." : "Satu permintaan perubahan disetujui; menunggu yang lain.",
    link: `/purchasing/po/${po.id}`,
    purchaseOrderId: po.id,
  });
}

export async function onChangeRejected(tx: Tx, ctx: ActorContext, changeRequestId: string, comment: string | null) {
  const cr = await tx.changeRequest.findUniqueOrThrow({ where: { id: changeRequestId }, include: { purchaseOrder: true, request: true } });
  await tx.changeRequest.update({ where: { id: cr.id }, data: { status: "REJECTED", decidedAt: new Date() } });
  await audit(tx, ctx, { action: "change_request.rejected", entityType: "change_request", entityId: cr.id, reason: comment });
  if (cr.purchaseOrder) {
    await cancelPendingChangeRequests(tx, cr.purchaseOrder.id, "Dihentikan karena perubahan lain ditolak.");
    if (cr.purchaseOrder.status === "PENDING_CHANGE_APPROVAL") {
      await setPoStatus(tx, ctx, cr.purchaseOrder.id, "PENDING_CHANGE_APPROVAL", "DRAFT", `Perubahan ditolak: ${comment ?? "-"}`, {
        holdReason: `Perubahan untuk ${cr.request.requestNumber} ditolak oleh ${ctx.user.fullName}: ${comment ?? "-"}`,
      });
    }
    await notify(tx, {
      recipientIds: [cr.purchaseOrder.purchasingOwnerId],
      type: "CHANGE_DECIDED",
      title: `Perubahan ditolak: ${cr.purchaseOrder.poNumber}`,
      body: `${ctx.user.fullName}: ${comment ?? "-"}. Sesuaikan PO lalu ajukan kembali.`,
      link: `/purchasing/po/${cr.purchaseOrder.id}`,
      purchaseOrderId: cr.purchaseOrder.id,
      mandatory: true,
    });
  }
}

/** Mengembalikan PO ke Draf (membatalkan permintaan perubahan yang menunggu). */
export async function revertToDraft(ctx: ActorContext, poId: string) {
  requirePurchasing(ctx);
  return transaction(async (tx) => {
    const po = await loadPo(tx, poId);
    if (po.status !== "PENDING_CHANGE_APPROVAL" && po.status !== "READY_TO_ORDER") {
      throw new RuleError("PO hanya dapat dikembalikan ke Draf dari status Menunggu Persetujuan Perubahan atau Siap Dipesan.");
    }
    await cancelPendingChangeRequests(tx, poId, "PO dikembalikan ke draf oleh purchasing.");
    await setPoStatus(tx, ctx, poId, po.status, "DRAFT", "Dikembalikan ke draf", { holdReason: null });
    await audit(tx, ctx, { action: "po.revert_draft", entityType: "purchase_order", entityId: poId });
  });
}

/** Mengusulkan pengurangan kebutuhan (mis. tidak semua kuantitas perlu dibeli). */
export async function proposeQuantityReduction(ctx: ActorContext, requestItemId: string, newQuantity: string | number, reason: string) {
  requirePurchasing(ctx);
  if (!reason?.trim()) throw new ValidationError("Alasan wajib diisi.");
  return transaction(async (tx) => {
    const ri = await tx.requestItem.findUnique({ where: { id: requestItemId }, include: { request: true } });
    if (!ri) throw new NotFoundError();
    if (!["APPROVED", "IN_PROCUREMENT"].includes(ri.request.status)) throw new RuleError("Item tidak berada di antrean purchasing.");
    const qty = dec(newQuantity);
    const [f] = (await itemFulfilment(tx, ri.requestId)).filter((x) => x.requestItemId === ri.id);
    const minimum = dec(ri.cancelledQuantity).plus(f?.allocated ?? 0);
    if (qty.lt(minimum) || qty.lte(0)) throw new ValidationError(`Jumlah baru minimal ${minimum.toString()} (sudah dipesan).`);
    if (qty.gte(ri.quantity)) throw new ValidationError("Jumlah baru harus lebih kecil dari jumlah saat ini.");
    const cr = await tx.changeRequest.create({
      data: {
        requestId: ri.requestId,
        reason: reason.trim(),
        createdById: ctx.user.id,
        items: { create: [{ requestItemId: ri.id, changeType: "QUANTITY", oldQuantity: ri.quantity, newQuantity: qty }] },
      },
    });
    const started = await startApproval(tx, ctx, {
      subjectType: "CHANGE_REQUEST",
      requestId: ri.requestId,
      changeRequestId: cr.id,
      amount: lineTotal(qty, ri.estimatedUnitPrice),
      initiatorId: ctx.user.id,
    });
    if (started.status === "APPROVED") await onChangeApproved(tx, ctx, cr.id);
    await audit(tx, ctx, { action: "change_request.create", entityType: "change_request", entityId: cr.id, reason });
    return { id: cr.id, status: started.status, holdReason: started.holdReason };
  });
}

// ---------------------------------------------------------------------------
// Pemesanan, tindak lanjut, pembatalan, penutupan
// ---------------------------------------------------------------------------

export async function markOrdered(
  ctx: ActorContext,
  poId: string,
  input: { orderedAt?: string | null; expectedDeliveryDate: string; vendorReference?: string | null },
) {
  requirePurchasing(ctx);
  return transaction(async (tx) => {
    const po = await loadPo(tx, poId);
    if (po.status !== "READY_TO_ORDER") throw new RuleError("PO harus berstatus Siap Dipesan.");
    if (!po.vendorId) throw new ValidationError("Vendor belum dipilih.");
    if (!input.expectedDeliveryDate) throw new ValidationError("Perkiraan tanggal kedatangan wajib diisi.");
    const quotes = await tx.vendorQuote.findMany({ where: { purchaseOrderId: poId } });
    if (quotes.length > 0 && !quotes.some((q) => q.isSelected)) throw new RuleError("Pilih penawaran yang digunakan terlebih dahulu.");
    const checks = await checkDocumentRequirements(tx, "PO_ORDER", { purchaseOrderId: poId, amount: po.totalAmount });
    // PO pengganti memakai harga & vendor pesanan asal sehingga tidak memerlukan penawaran baru.
    const unmet = unmetMessages(po.replacesPurchaseOrderId ? checks.filter((c) => c.documentType !== "VENDOR_QUOTE") : checks);
    if (unmet.length) throw new RuleError(`Dokumen wajib belum lengkap: ${unmet.join("; ")}.`);
    const eta = dateOnly(input.expectedDeliveryDate);
    await setPoStatus(tx, ctx, poId, "READY_TO_ORDER", "ORDERED", "Dipesan ke vendor", {
      orderedAt: input.orderedAt ? new Date(input.orderedAt) : new Date(),
      expectedDeliveryDate: eta,
      currentEta: eta,
      vendorReference: input.vendorReference?.trim() || po.vendorReference,
    });
    const links = await tx.purchaseOrderRequest.findMany({ where: { purchaseOrderId: poId }, include: { request: true } });
    for (const l of links) {
      await syncRequestProcurement(tx, ctx, l.requestId);
      await tx.request.update({ where: { id: l.requestId }, data: { lastActivityAt: new Date() } });
    }
    await notify(tx, {
      recipientIds: links.map((l) => l.request.requesterId),
      type: "PO_ORDERED",
      title: `Barang sudah dipesan (${po.poNumber})`,
      body: `Pesanan untuk pengajuan Anda telah dikirim ke vendor. Perkiraan kedatangan: ${input.expectedDeliveryDate}.`,
      link: links.length === 1 ? `/pengajuan/${links[0].requestId}` : "/pengajuan",
      purchaseOrderId: poId,
    });
    await audit(tx, ctx, { action: "po.ordered", entityType: "purchase_order", entityId: poId, newValues: { eta: input.expectedDeliveryDate } });
  });
}

export interface FollowupInput {
  followupType: FollowupType;
  reason?: string | null;
  newEta?: string | null;
  actionTaken: string;
  actionDate: string;
  responsibleUserId?: string | null;
  vendorResponse?: string | null;
  targetResolutionDate?: string | null;
}

export async function addFollowup(ctx: ActorContext, poId: string, input: FollowupInput) {
  requirePurchasing(ctx);
  if (!input.actionTaken?.trim()) throw new ValidationError("Tindakan wajib diisi.", { actionTaken: "Wajib diisi" });
  if (input.followupType === "DELAY") {
    const missing: Record<string, string> = {};
    if (!input.reason?.trim()) missing.reason = "Alasan keterlambatan wajib diisi";
    if (!input.newEta) missing.newEta = "Perkiraan tanggal baru wajib diisi";
    if (!input.targetResolutionDate) missing.targetResolutionDate = "Target penyelesaian wajib diisi";
    if (Object.keys(missing).length) throw new ValidationError("Lengkapi data keterlambatan (FR-PUR-13).", missing);
  }
  return transaction(async (tx) => {
    const po = await loadPo(tx, poId);
    if (["CLOSED", "CANCELLED"].includes(po.status)) throw new RuleError("PO sudah selesai/dibatalkan.");
    const responsible = input.responsibleUserId || ctx.user.id;
    const f = await tx.purchaseFollowup.create({
      data: {
        purchaseOrderId: poId,
        followupType: input.followupType,
        reason: input.reason?.trim() || null,
        previousEta: po.currentEta,
        newEta: input.newEta ? dateOnly(input.newEta) : null,
        actionTaken: input.actionTaken.trim(),
        actionDate: dateOnly(input.actionDate),
        responsibleUserId: responsible,
        vendorResponse: input.vendorResponse?.trim() || null,
        targetResolutionDate: input.targetResolutionDate ? dateOnly(input.targetResolutionDate) : null,
        createdById: ctx.user.id,
      },
    });
    await tx.purchaseOrder.update({
      where: { id: poId },
      data: { lastActivityAt: new Date(), needsReviewAt: null, ...(input.newEta ? { currentEta: dateOnly(input.newEta) } : {}) },
    });
    const links = await tx.purchaseOrderRequest.findMany({ where: { purchaseOrderId: poId }, include: { request: true } });
    if (input.newEta) {
      await notify(tx, {
        recipientIds: links.map((l) => l.request.requesterId),
        type: "PO_ETA_CHANGED",
        title: `Perkiraan kedatangan berubah (${po.poNumber})`,
        body: `ETA baru: ${input.newEta}. ${input.reason ? `Alasan: ${input.reason}` : ""}`.trim(),
        link: links.length === 1 ? `/pengajuan/${links[0].requestId}` : "/pengajuan",
        purchaseOrderId: poId,
      });
    }
    if (input.followupType === "ESCALATION") {
      const owner = await tx.user.findUnique({
        where: { id: po.purchasingOwnerId },
        include: { employee: { include: { supervisor: { select: { user: { select: { id: true } } } } } } },
      });
      await notify(tx, {
        recipientIds: [owner?.employee?.supervisor?.user?.id],
        type: "APPROVAL_ESCALATION",
        title: `Eskalasi vendor: ${po.poNumber}`,
        body: `${ctx.user.fullName}: ${input.actionTaken}${input.vendorResponse ? ` — respons vendor: ${input.vendorResponse}` : ""}`,
        link: `/purchasing/po/${poId}`,
        purchaseOrderId: poId,
        mandatory: true,
      });
    }
    await audit(tx, ctx, { action: "po.followup", entityType: "purchase_order", entityId: poId, newValues: { type: input.followupType, newEta: input.newEta } });
    return { id: f.id };
  });
}

export async function cancelPurchaseOrder(ctx: ActorContext, poId: string, reason: string) {
  requirePurchasing(ctx);
  if (!reason?.trim()) throw new ValidationError("Alasan pembatalan wajib diisi.");
  return transaction(async (tx) => {
    const po = await loadPo(tx, poId);
    const afterOrder = ["ORDERED", "PARTIALLY_RECEIVED", "ON_HOLD"].includes(po.status);
    if (!afterOrder && !["DRAFT", "PENDING_CHANGE_APPROVAL", "READY_TO_ORDER"].includes(po.status)) {
      throw new RuleError("PO pada status ini tidak dapat dibatalkan.");
    }
    if (afterOrder && !can(ctx.user, PERMISSIONS.PO_CANCEL_AFTER_ORDER)) {
      throw new ForbiddenError("Pembatalan PO yang sudah dipesan memerlukan kewenangan khusus.");
    }
    const accepted = await tx.goodsReceiptItem.count({
      where: { purchaseOrderItem: { purchaseOrderId: poId }, quantityAccepted: { gt: 0 } },
    });
    if (accepted > 0) {
      throw new RuleError("Sebagian barang sudah diterima. Gunakan penyelesaian kekurangan (Laporkan kekurangan) untuk sisa pesanan.");
    }
    await cancelPendingChangeRequests(tx, poId, "PO dibatalkan.");
    await tx.receiptDiscrepancy.updateMany({
      where: { purchaseOrderId: poId, status: { not: "RESOLVED" } },
      data: { status: "RESOLVED", resolutionType: "OTHER", resolutionNote: `PO dibatalkan: ${reason.trim()}`, resolvedById: ctx.user.id, resolvedAt: new Date() },
    });
    await setPoStatus(tx, ctx, poId, po.status, "CANCELLED", reason.trim(), {
      cancellationReason: reason.trim(),
      cancelledById: ctx.user.id,
      cancelledAt: new Date(),
    });
    const links = await tx.purchaseOrderRequest.findMany({ where: { purchaseOrderId: poId }, include: { request: true } });
    for (const l of links) await syncRequestProcurement(tx, ctx, l.requestId);
    if (afterOrder) {
      await notify(tx, {
        recipientIds: links.map((l) => l.request.requesterId),
        type: "PO_DELAYED",
        title: `Pesanan dibatalkan (${po.poNumber})`,
        body: `Pesanan ke vendor dibatalkan: ${reason}. Item kembali ke antrean purchasing untuk diproses ulang.`,
        link: links.length === 1 ? `/pengajuan/${links[0].requestId}` : "/pengajuan",
        purchaseOrderId: poId,
        mandatory: true,
      });
    }
    await audit(tx, ctx, { action: "po.cancel", entityType: "purchase_order", entityId: poId, reason });
  });
}

export async function closePurchaseOrder(ctx: ActorContext, poId: string) {
  requirePurchasing(ctx);
  return transaction(async (tx) => {
    const po = await loadPo(tx, poId);
    if (po.status !== "RECEIVED") throw new RuleError("PO hanya dapat ditutup setelah semua barang diterima/diselesaikan.");
    const open = await tx.receiptDiscrepancy.count({ where: { purchaseOrderId: poId, status: { not: "RESOLVED" } } });
    if (open) throw new RuleError("Masih ada masalah barang yang belum diselesaikan.");
    const links = await tx.purchaseOrderRequest.findMany({ where: { purchaseOrderId: poId }, include: { request: true } });
    const unfinished = links.filter((l) => !["COMPLETED", "CANCELLED"].includes(l.request.status));
    if (unfinished.length) {
      throw new RuleError(
        `Serah terima belum selesai untuk: ${unfinished.map((u) => u.request.requestNumber).join(", ")}.`,
      );
    }
    const checks = await checkDocumentRequirements(tx, "PO_CLOSE", { purchaseOrderId: poId, amount: po.totalAmount });
    const unmet = unmetMessages(checks);
    if (unmet.length) throw new RuleError(`Dokumen wajib belum lengkap: ${unmet.join("; ")}.`);
    await setPoStatus(tx, ctx, poId, "RECEIVED", "CLOSED", "Transaksi ditutup", { closedAt: new Date() });
    await audit(tx, ctx, { action: "po.close", entityType: "purchase_order", entityId: poId });
  });
}

export async function addPoComment(ctx: ActorContext, poId: string, body: string) {
  requirePurchasing(ctx);
  const text = body.trim();
  if (!text) throw new ValidationError("Catatan tidak boleh kosong.");
  return transaction(async (tx) => {
    await loadPo(tx, poId);
    await tx.comment.create({ data: { purchaseOrderId: poId, authorId: ctx.user.id, body: text.slice(0, 4000), isInternal: true } });
    await tx.purchaseOrder.update({ where: { id: poId }, data: { lastActivityAt: new Date(), needsReviewAt: null } });
  });
}

export { recomputeTotal };
