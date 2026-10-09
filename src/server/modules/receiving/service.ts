import type { Tx } from "@/server/db";
import type { ActorContext } from "@/server/context";
import type { DiscrepancyType, ItemCondition, ResolutionType } from "@/generated/prisma/enums";
import { audit } from "@/server/audit";
import { transaction, withIdempotency } from "@/server/idempotency";
import { DOC_PREFIX, nextNumber } from "@/server/numbering";
import { dec, lineTotal, sum } from "@/server/money";
import { notify } from "@/server/notifications/notify";
import { can } from "@/server/auth/user";
import { PERMISSIONS } from "@/lib/permissions";
import { DISCREPANCY_TYPE, RESOLUTION_TYPE } from "@/lib/status";
import { ForbiddenError, NotFoundError, RuleError, ValidationError } from "@/server/errors";
import { startApproval } from "@/server/modules/approvals/engine";
import { syncRequestProcurement } from "@/server/modules/requests/service";
import { setPoStatus, recomputeTotal } from "@/server/modules/purchasing/service";

function requirePurchasing(ctx: ActorContext) {
  if (!can(ctx.user, PERMISSIONS.PURCHASING_MANAGE)) throw new ForbiddenError("Hanya Purchasing yang dapat mencatat penerimaan.");
}

/** Sisa kuantitas yang masih ditunggu per baris PO. */
export async function poLineOutstanding(tx: Tx, poId: string) {
  const lines = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId: poId },
    include: { receiptItems: true, requestItem: { select: { requestId: true } } },
    orderBy: { lineNo: "asc" },
  });
  return lines.map((l) => {
    const accepted = sum(l.receiptItems.map((r) => r.quantityAccepted));
    const rejected = sum(l.receiptItems.map((r) => r.quantityRejected));
    const outstanding = dec(l.quantityOrdered).minus(l.closedQuantity).minus(accepted);
    return { line: l, accepted, rejected, outstanding: outstanding.gt(0) ? outstanding : dec(0) };
  });
}

/**
 * Menyesuaikan status PO setelah penerimaan / penyelesaian masalah:
 * barang rusak/tidak sesuai menahan SELURUH pesanan (FR-RCV-04).
 */
export async function syncPoReceiptStatus(tx: Tx, ctx: ActorContext | null, poId: string) {
  const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
  if (!["ORDERED", "PARTIALLY_RECEIVED", "ON_HOLD", "RECEIVED"].includes(po.status)) return po.status;
  const blocking = await tx.receiptDiscrepancy.count({
    where: { purchaseOrderId: poId, status: { not: "RESOLVED" }, type: { in: ["DAMAGED", "WRONG_ITEM", "OTHER"] } },
  });
  const openAny = await tx.receiptDiscrepancy.count({ where: { purchaseOrderId: poId, status: { not: "RESOLVED" } } });
  const lines = await poLineOutstanding(tx, poId);
  const anyAccepted = lines.some((l) => l.accepted.gt(0));
  const allDone = lines.every((l) => l.outstanding.lte(0));

  let target = po.status;
  if (blocking > 0) target = "ON_HOLD";
  else if (allDone && openAny === 0) target = "RECEIVED";
  else if (anyAccepted) target = "PARTIALLY_RECEIVED";
  else target = "ORDERED";

  if (target !== po.status) {
    const reason =
      target === "ON_HOLD"
        ? "Ditahan: ada barang rusak/tidak sesuai"
        : target === "RECEIVED"
          ? "Semua barang diterima / pengecualian selesai"
          : target === "PARTIALLY_RECEIVED"
            ? "Diterima sebagian"
            : "Menunggu pengiriman";
    await setPoStatus(tx, ctx, poId, po.status, target, reason, {
      holdReason: target === "ON_HOLD" ? "Ada barang rusak/tidak sesuai yang belum diselesaikan." : null,
      ...(target === "RECEIVED" ? { receivedAt: new Date() } : {}),
    });
  }
  return target;
}

export interface ReceiptLineInput {
  purchaseOrderItemId: string;
  quantityReceived: string | number;
  quantityRejected?: string | number;
  condition?: ItemCondition;
  notes?: string | null;
}

/** Mencatat satu peristiwa penerimaan dari vendor (boleh parsial). */
export async function recordReceipt(
  ctx: ActorContext,
  poId: string,
  input: { receivedAt?: string | null; deliveryNoteNumber?: string | null; notes?: string | null; lines: ReceiptLineInput[] },
  idempotencyKey?: string,
) {
  requirePurchasing(ctx);
  const lines = input.lines.filter((l) => dec(l.quantityReceived).gt(0));
  if (!lines.length) throw new ValidationError("Isi jumlah diterima minimal pada satu baris.");
  return withIdempotency(ctx.user.id, idempotencyKey, `receipt.create:${poId}`, async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) throw new NotFoundError("PO tidak ditemukan.");
    if (!["ORDERED", "PARTIALLY_RECEIVED", "ON_HOLD"].includes(po.status)) {
      throw new RuleError("Penerimaan hanya dapat dicatat untuk PO yang sudah dipesan.");
    }
    const outstanding = await poLineOutstanding(tx, poId);
    const receiptNumber = await nextNumber(tx, DOC_PREFIX.RECEIPT);
    const receipt = await tx.goodsReceipt.create({
      data: {
        receiptNumber,
        purchaseOrderId: poId,
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
        receivedById: ctx.user.id,
        deliveryNoteNumber: input.deliveryNoteNumber?.trim() || null,
        notes: input.notes?.trim() || null,
      },
    });
    const discrepancies: Array<{ itemName: string; type: DiscrepancyType; qty: string }> = [];
    for (const l of lines) {
      const o = outstanding.find((x) => x.line.id === l.purchaseOrderItemId);
      if (!o) throw new ValidationError("Baris PO tidak valid.");
      const received = dec(l.quantityReceived);
      const rejected = dec(l.quantityRejected ?? 0);
      if (rejected.lt(0) || rejected.gt(received)) throw new ValidationError(`Jumlah ditolak untuk "${o.line.itemName}" tidak valid.`);
      const accepted = received.minus(rejected);
      const condition: ItemCondition = l.condition ?? (rejected.gt(0) ? "DAMAGED" : "GOOD");
      if (condition !== "GOOD" && rejected.lte(0)) {
        throw new ValidationError(`Isi jumlah yang rusak/tidak sesuai untuk "${o.line.itemName}".`);
      }
      if (condition === "GOOD" && rejected.gt(0)) {
        throw new ValidationError(`Pilih kondisi "Rusak" atau "Tidak sesuai" untuk "${o.line.itemName}".`);
      }
      if (accepted.gt(o.outstanding)) {
        throw new ValidationError(
          `Jumlah diterima baik untuk "${o.line.itemName}" melebihi sisa pesanan (${o.outstanding.toString()} ${o.line.unitName}).`,
        );
      }
      const ri = await tx.goodsReceiptItem.create({
        data: {
          receiptId: receipt.id,
          purchaseOrderItemId: o.line.id,
          quantityReceived: received,
          quantityAccepted: accepted,
          quantityRejected: rejected,
          condition,
          notes: l.notes?.trim() || null,
        },
      });
      if (rejected.gt(0)) {
        const type: DiscrepancyType = condition === "WRONG_ITEM" ? "WRONG_ITEM" : "DAMAGED";
        await tx.receiptDiscrepancy.create({
          data: {
            purchaseOrderId: poId,
            purchaseOrderItemId: o.line.id,
            goodsReceiptItemId: ri.id,
            type,
            quantity: rejected,
            description: l.notes?.trim() || `${DISCREPANCY_TYPE[type]} saat penerimaan ${receiptNumber}`,
            reportedById: ctx.user.id,
          },
        });
        discrepancies.push({ itemName: o.line.itemName, type, qty: rejected.toString() });
      }
    }
    await tx.purchaseOrder.update({ where: { id: poId }, data: { lastActivityAt: new Date(), needsReviewAt: null } });
    const status = await syncPoReceiptStatus(tx, ctx, poId);
    const links = await tx.purchaseOrderRequest.findMany({ where: { purchaseOrderId: poId }, include: { request: true } });
    for (const link of links) {
      await syncRequestProcurement(tx, ctx, link.requestId);
      await tx.request.update({ where: { id: link.requestId }, data: { lastActivityAt: new Date() } });
    }
    await notify(tx, {
      recipientIds: links.map((l) => l.request.requesterId),
      type: "GOODS_RECEIVED",
      title: `Barang diterima dari vendor (${po.poNumber})`,
      body:
        status === "RECEIVED"
          ? "Seluruh barang pesanan telah diterima. Purchasing akan menyiapkan serah terima."
          : "Sebagian barang telah diterima. Serah terima dilakukan setelah pesanan lengkap.",
      link: links.length === 1 ? `/pengajuan/${links[0].requestId}` : "/pengajuan",
      purchaseOrderId: poId,
    });
    if (discrepancies.length) {
      await notify(tx, {
        recipientIds: [po.purchasingOwnerId, ...links.map((l) => l.request.requesterId)],
        type: "DISCREPANCY_REPORTED",
        title: `Masalah barang pada ${po.poNumber}`,
        body: `${discrepancies.map((d) => `${d.itemName}: ${DISCREPANCY_TYPE[d.type]} (${d.qty})`).join("; ")}. Pesanan ditahan sampai diselesaikan.`,
        link: `/purchasing/po/${poId}`,
        purchaseOrderId: poId,
        mandatory: true,
        excludeUserId: ctx.user.id,
      });
    }
    await audit(tx, ctx, {
      action: "receipt.create",
      entityType: "goods_receipt",
      entityId: receipt.id,
      newValues: { receiptNumber, poId, lines: lines.length, discrepancies: discrepancies.length, poStatus: status },
    });
    return { id: receipt.id, receiptNumber, poStatus: status };
  });
}

/** Vendor tidak dapat memenuhi sisa kuantitas (FR-PUR-15). */
export async function reportShortage(ctx: ActorContext, poId: string, purchaseOrderItemId: string, quantity: string | number, description: string) {
  requirePurchasing(ctx);
  if (!description?.trim()) throw new ValidationError("Keterangan wajib diisi.");
  return transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po || !["ORDERED", "PARTIALLY_RECEIVED", "ON_HOLD"].includes(po.status)) throw new RuleError("PO tidak dalam status pengiriman.");
    const outstanding = await poLineOutstanding(tx, poId);
    const o = outstanding.find((x) => x.line.id === purchaseOrderItemId);
    if (!o) throw new ValidationError("Baris PO tidak valid.");
    const openShortage = await tx.receiptDiscrepancy.aggregate({
      where: { purchaseOrderItemId, status: { not: "RESOLVED" } },
      _sum: { quantity: true },
    });
    // Unit yang sudah ditangani oleh masalah lain yang masih terbuka tidak dihitung lagi.
    const available = o.outstanding.minus(dec(openShortage._sum.quantity ?? 0));
    const qty = dec(quantity);
    if (qty.lte(0) || qty.gt(available)) throw new ValidationError(`Jumlah kekurangan maksimal ${available.toString()} ${o.line.unitName}.`);
    const d = await tx.receiptDiscrepancy.create({
      data: {
        purchaseOrderId: poId,
        purchaseOrderItemId,
        type: "SHORTAGE",
        quantity: qty,
        description: description.trim(),
        reportedById: ctx.user.id,
      },
    });
    await syncPoReceiptStatus(tx, ctx, poId);
    await audit(tx, ctx, { action: "discrepancy.report", entityType: "discrepancy", entityId: d.id, newValues: { type: "SHORTAGE", qty: qty.toString() } });
    return { id: d.id };
  });
}

/** Purchasing mengusulkan penyelesaian; disetujui melalui matriks (DISCREPANCY_RESOLUTION). */
export async function proposeResolution(
  ctx: ActorContext,
  discrepancyId: string,
  input: { resolutionType: ResolutionType; note: string },
) {
  requirePurchasing(ctx);
  if (!input.note?.trim()) throw new ValidationError("Catatan penyelesaian wajib diisi.");
  return transaction(async (tx) => {
    const d = await tx.receiptDiscrepancy.findUnique({
      where: { id: discrepancyId },
      include: { purchaseOrderItem: { include: { requestItem: true } } },
    });
    if (!d) throw new NotFoundError();
    if (d.status !== "OPEN") throw new RuleError("Masalah ini sudah dalam proses atau selesai.");
    await tx.receiptDiscrepancy.update({
      where: { id: d.id },
      data: { status: "PENDING_APPROVAL", resolutionType: input.resolutionType, resolutionNote: input.note.trim() },
    });
    const started = await startApproval(tx, ctx, {
      subjectType: "DISCREPANCY_RESOLUTION",
      requestId: d.purchaseOrderItem.requestItem.requestId,
      discrepancyId: d.id,
      amount: lineTotal(d.quantity, d.purchaseOrderItem.unitPrice),
      initiatorId: ctx.user.id,
    });
    await audit(tx, ctx, {
      action: "discrepancy.propose",
      entityType: "discrepancy",
      entityId: d.id,
      newValues: { resolution: input.resolutionType, approval: started.status },
      reason: input.note,
    });
    if (started.status === "APPROVED") await applyResolution(tx, ctx, d.id);
    return { status: started.status, holdReason: started.holdReason };
  });
}

/** Menerapkan penyelesaian yang disetujui. */
export async function applyResolution(tx: Tx, ctx: ActorContext, discrepancyId: string) {
  const d = await tx.receiptDiscrepancy.findUniqueOrThrow({
    where: { id: discrepancyId },
    include: { purchaseOrder: true, purchaseOrderItem: { include: { requestItem: true } } },
  });
  if (d.status !== "PENDING_APPROVAL" || !d.resolutionType) return;
  const line = d.purchaseOrderItem;
  // Kuantitas bermasalah tidak lagi ditunggu dari pesanan asal.
  await tx.purchaseOrderItem.update({
    where: { id: line.id },
    data: { closedQuantity: dec(line.closedQuantity).plus(d.quantity) },
  });
  let replacementPoId: string | null = null;
  if (d.resolutionType === "REPLACEMENT") {
    const poNumber = await nextNumber(tx, DOC_PREFIX.PURCHASE_ORDER);
    const replacement = await tx.purchaseOrder.create({
      data: {
        poNumber,
        vendorId: d.purchaseOrder.vendorId,
        purchasingOwnerId: d.purchaseOrder.purchasingOwnerId,
        title: `Pengganti ${d.purchaseOrder.poNumber}`,
        notes: d.resolutionNote,
        replacesPurchaseOrderId: d.purchaseOrderId,
        replacementForDiscrepancyId: d.id,
      },
    });
    await tx.purchaseOrderItem.create({
      data: {
        purchaseOrderId: replacement.id,
        requestItemId: line.requestItemId,
        lineNo: 1,
        itemName: line.itemName,
        specification: line.specification,
        unitName: line.unitName,
        quantityOrdered: d.quantity,
        unitPrice: line.unitPrice,
        lineTotal: lineTotal(d.quantity, line.unitPrice),
        notes: `Pengganti untuk ${DISCREPANCY_TYPE[d.type].toLowerCase()} pada ${d.purchaseOrder.poNumber}`,
      },
    });
    await recomputeTotal(tx, replacement.id);
    await tx.purchaseOrderRequest.create({
      data: { purchaseOrderId: replacement.id, requestId: line.requestItem.requestId, linkedById: ctx.user.id },
    });
    await tx.purchaseOrderStatusHistory.create({
      data: { purchaseOrderId: replacement.id, toStatus: "DRAFT", changedById: ctx.user.id, reason: `Pengganti untuk ${d.purchaseOrder.poNumber}` },
    });
    replacementPoId = replacement.id;
  } else {
    // Kekurangan diterima / retur tanpa pengganti: kebutuhan pemohon ditutup secara resmi.
    await tx.requestItem.update({
      where: { id: line.requestItemId },
      data: { cancelledQuantity: dec(line.requestItem.cancelledQuantity).plus(d.quantity) },
    });
  }
  await tx.receiptDiscrepancy.update({
    where: { id: d.id },
    data: { status: "RESOLVED", resolvedById: ctx.user.id, resolvedAt: new Date() },
  });
  await syncPoReceiptStatus(tx, ctx, d.purchaseOrderId);
  await syncRequestProcurement(tx, ctx, line.requestItem.requestId);
  const req = await tx.request.findUniqueOrThrow({ where: { id: line.requestItem.requestId } });
  await notify(tx, {
    recipientIds: [d.purchaseOrder.purchasingOwnerId, req.requesterId],
    type: "DISCREPANCY_RESOLVED",
    title: `Masalah barang diselesaikan (${d.purchaseOrder.poNumber})`,
    body: `${line.itemName}: ${RESOLUTION_TYPE[d.resolutionType].label}. ${d.resolutionNote ?? ""}`.trim(),
    link: replacementPoId ? `/purchasing/po/${replacementPoId}` : `/pengajuan/${req.id}`,
    purchaseOrderId: d.purchaseOrderId,
  });
  await audit(tx, ctx, {
    action: "discrepancy.resolved",
    entityType: "discrepancy",
    entityId: d.id,
    newValues: { resolution: d.resolutionType, replacementPoId },
  });
}

export async function onResolutionRejected(tx: Tx, ctx: ActorContext, discrepancyId: string, comment: string | null) {
  const d = await tx.receiptDiscrepancy.findUniqueOrThrow({ where: { id: discrepancyId }, include: { purchaseOrder: true } });
  if (d.status !== "PENDING_APPROVAL") return;
  await tx.receiptDiscrepancy.update({ where: { id: d.id }, data: { status: "OPEN" } });
  await notify(tx, {
    recipientIds: [d.purchaseOrder.purchasingOwnerId],
    type: "DISCREPANCY_REPORTED",
    title: `Usulan penyelesaian ditolak (${d.purchaseOrder.poNumber})`,
    body: `${ctx.user.fullName}: ${comment ?? "-"}. Ajukan penyelesaian lain.`,
    link: `/purchasing/po/${d.purchaseOrderId}`,
    purchaseOrderId: d.purchaseOrderId,
    mandatory: true,
  });
  await audit(tx, ctx, { action: "discrepancy.rejected", entityType: "discrepancy", entityId: d.id, reason: comment });
}
