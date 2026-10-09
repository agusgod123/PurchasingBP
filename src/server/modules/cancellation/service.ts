import type { Tx } from "@/server/db";
import type { ActorContext } from "@/server/context";
import type { PurchaseOrderStatus, RequestStatus } from "@/generated/prisma/enums";
import { audit } from "@/server/audit";
import { transaction } from "@/server/idempotency";
import { dec, sum } from "@/server/money";
import { notify } from "@/server/notifications/notify";
import { getSettings } from "@/server/settings";
import { can } from "@/server/auth/user";
import { PERMISSIONS } from "@/lib/permissions";
import { ForbiddenError, NotFoundError, RuleError, ValidationError } from "@/server/errors";
import { cancelApproval, findActiveInstance, startApproval } from "@/server/modules/approvals/engine";
import { setRequestStatus } from "@/server/modules/requests/service";
import { recomputeTotal, setPoStatus } from "@/server/modules/purchasing/service";
import { syncPoReceiptStatus } from "@/server/modules/receiving/service";

const ORDERED_PO: PurchaseOrderStatus[] = ["ORDERED", "PARTIALLY_RECEIVED", "ON_HOLD", "RECEIVED"];

/**
 * Pembatalan pengajuan:
 * - Pemohon dapat membatalkan langsung pada status awal (pengaturan).
 * - Setelah disetujui: diusulkan; diproses Purchasing (belum dipesan) atau
 *   melalui matriks persetujuan pembatalan (sudah dipesan ke vendor).
 */
export async function requestCancellation(ctx: ActorContext, requestId: string, reason: string) {
  if (!reason?.trim()) throw new ValidationError("Alasan pembatalan wajib diisi.", { reason: "Wajib diisi" });
  return transaction(async (tx) => {
    const req = await tx.request.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundError();
    const isRequester = req.requesterId === ctx.user.id;
    const isOperator = can(ctx.user, PERMISSIONS.REQUEST_CANCEL_ANY);
    if (!isRequester && !isOperator) throw new ForbiddenError();
    const settings = await getSettings();

    if (settings["request.requester_cancel_statuses"].includes(req.status) && (isRequester || isOperator)) {
      const active = await findActiveInstance(tx, { requestId, subjectType: "REQUEST" });
      if (active) await cancelApproval(tx, active.id, "Pengajuan dibatalkan.");
      await setRequestStatus(tx, ctx, requestId, req.status, "CANCELLED", reason.trim(), {
        cancelledAt: new Date(),
        cancelledById: ctx.user.id,
        cancellationReason: reason.trim(),
      });
      await audit(tx, ctx, { action: "request.cancel", entityType: "request", entityId: requestId, reason });
      return { status: "CANCELLED" as const };
    }

    if (!["APPROVED", "IN_PROCUREMENT"].includes(req.status)) {
      throw new RuleError("Pengajuan pada tahap ini tidak dapat dibatalkan. Hubungi Purchasing.");
    }
    const accepted = await tx.goodsReceiptItem.count({
      where: { quantityAccepted: { gt: 0 }, purchaseOrderItem: { requestItem: { requestId } } },
    });
    if (accepted > 0) throw new RuleError("Sebagian barang sudah diterima dari vendor. Hubungi Purchasing untuk penyelesaian.");

    const cr = await tx.cancellationRequest.create({
      data: { requestId, requestedById: ctx.user.id, reason: reason.trim(), previousStatus: req.status },
    });
    await setRequestStatus(tx, ctx, requestId, req.status, "CANCELLATION_REQUESTED", reason.trim());

    const ordered = await tx.purchaseOrderItem.count({
      where: { requestItem: { requestId }, purchaseOrder: { status: { in: ORDERED_PO } } },
    });
    let routedToApproval = false;
    if (ordered > 0) {
      const started = await startApproval(tx, ctx, {
        subjectType: "CANCELLATION",
        requestId,
        cancellationRequestId: cr.id,
        amount: dec(req.estimatedTotal),
        initiatorId: ctx.user.id,
      });
      routedToApproval = started.status !== "ON_HOLD";
      if (started.status === "APPROVED") await applyCancellation(tx, ctx, cr.id);
    }
    if (!routedToApproval) {
      const purchasing = await tx.user.findMany({
        where: {
          accountStatus: "ACTIVE",
          roles: { some: { role: { permissions: { some: { permission: { code: PERMISSIONS.REQUEST_CANCEL_ANY } } } } } },
        },
        select: { id: true },
      });
      await notify(tx, {
        recipientIds: purchasing.map((p) => p.id),
        type: "CANCELLATION_REQUESTED",
        title: `Usulan pembatalan: ${req.requestNumber}`,
        body: `${ctx.user.fullName}: ${reason}`,
        link: `/pengajuan/${requestId}`,
        requestId,
        mandatory: true,
        excludeUserId: ctx.user.id,
      });
    }
    await audit(tx, ctx, { action: "request.cancel_request", entityType: "request", entityId: requestId, reason });
    return { status: "CANCELLATION_REQUESTED" as const, viaApproval: routedToApproval };
  });
}

/** Purchasing memutuskan usulan pembatalan yang tidak melalui matriks persetujuan. */
export async function decideCancellation(ctx: ActorContext, cancellationRequestId: string, approve: boolean, note?: string | null) {
  if (!can(ctx.user, PERMISSIONS.REQUEST_CANCEL_ANY)) throw new ForbiddenError();
  return transaction(async (tx) => {
    const cr = await tx.cancellationRequest.findUnique({ where: { id: cancellationRequestId } });
    if (!cr || cr.status !== "PENDING") throw new RuleError("Usulan pembatalan tidak ditemukan atau sudah diputuskan.");
    const inst = await findActiveInstance(tx, { requestId: cr.requestId, subjectType: "CANCELLATION", cancellationRequestId: cr.id });
    if (inst && inst.status === "IN_PROGRESS") throw new RuleError("Usulan ini sedang diproses melalui persetujuan.");
    if (inst) await cancelApproval(tx, inst.id, "Diputuskan langsung oleh purchasing.");
    if (approve) await applyCancellation(tx, ctx, cr.id, note);
    else await rejectCancellation(tx, ctx, cr.id, note ?? null);
  });
}

export async function applyCancellation(tx: Tx, ctx: ActorContext, cancellationRequestId: string, note?: string | null) {
  const cr = await tx.cancellationRequest.findUniqueOrThrow({ where: { id: cancellationRequestId }, include: { request: true } });
  if (cr.status !== "PENDING") return;
  await tx.cancellationRequest.update({
    where: { id: cr.id },
    data: { status: "APPROVED", decidedById: ctx.user.id, decidedAt: new Date(), decisionNote: note ?? null },
  });
  // Hentikan baris PO yang terkait pengajuan ini.
  const lines = await tx.purchaseOrderItem.findMany({
    where: { requestItem: { requestId: cr.requestId }, purchaseOrder: { status: { notIn: ["CANCELLED", "CLOSED"] } } },
    include: { purchaseOrder: true, receiptItems: true },
  });
  const touchedPos = new Set<string>();
  for (const line of lines) {
    touchedPos.add(line.purchaseOrderId);
    if (ORDERED_PO.includes(line.purchaseOrder.status)) {
      const accepted = sum(line.receiptItems.map((r) => r.quantityAccepted));
      await tx.purchaseOrderItem.update({
        where: { id: line.id },
        data: { closedQuantity: dec(line.quantityOrdered).minus(accepted), notes: "Ditutup: pengajuan dibatalkan" },
      });
    } else {
      await tx.purchaseOrderItem.delete({ where: { id: line.id } });
    }
  }
  for (const poId of touchedPos) {
    await tx.purchaseOrderRequest.deleteMany({ where: { purchaseOrderId: poId, requestId: cr.requestId } });
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    const remaining = await tx.purchaseOrderItem.count({ where: { purchaseOrderId: poId } });
    if (remaining === 0 && ["DRAFT", "PENDING_CHANGE_APPROVAL", "READY_TO_ORDER"].includes(po.status)) {
      await setPoStatus(tx, ctx, poId, po.status, "CANCELLED", "Semua pengajuan dibatalkan", {
        cancelledAt: new Date(),
        cancelledById: ctx.user.id,
        cancellationReason: "Semua pengajuan dalam PO dibatalkan",
      });
    } else {
      await recomputeTotal(tx, poId);
      await syncPoReceiptStatus(tx, ctx, poId);
    }
  }
  await tx.changeRequest.updateMany({ where: { requestId: cr.requestId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
  await setRequestStatus(tx, ctx, cr.requestId, "CANCELLATION_REQUESTED", "CANCELLED", cr.reason, {
    cancelledAt: new Date(),
    cancelledById: cr.requestedById,
    cancellationReason: cr.reason,
  });
  await notify(tx, {
    recipientIds: [cr.request.requesterId, cr.requestedById],
    type: "REQUEST_CANCELLED",
    title: `Pengajuan dibatalkan: ${cr.request.requestNumber}`,
    body: `Alasan: ${cr.reason}${note ? `. Catatan: ${note}` : ""}`,
    link: `/pengajuan/${cr.requestId}`,
    requestId: cr.requestId,
    excludeUserId: ctx.user.id,
  });
  await audit(tx, ctx, { action: "request.cancelled", entityType: "request", entityId: cr.requestId, reason: cr.reason });
}

export async function rejectCancellation(tx: Tx, ctx: ActorContext, cancellationRequestId: string, note: string | null) {
  const cr = await tx.cancellationRequest.findUniqueOrThrow({ where: { id: cancellationRequestId }, include: { request: true } });
  if (cr.status !== "PENDING") return;
  await tx.cancellationRequest.update({
    where: { id: cr.id },
    data: { status: "REJECTED", decidedById: ctx.user.id, decidedAt: new Date(), decisionNote: note },
  });
  await setRequestStatus(tx, ctx, cr.requestId, "CANCELLATION_REQUESTED", cr.previousStatus as RequestStatus, `Pembatalan ditolak: ${note ?? "-"}`);
  await notify(tx, {
    recipientIds: [cr.requestedById, cr.request.requesterId],
    type: "REQUEST_CANCELLED",
    title: `Usulan pembatalan ditolak: ${cr.request.requestNumber}`,
    body: note ?? "Pengajuan tetap diproses.",
    link: `/pengajuan/${cr.requestId}`,
    requestId: cr.requestId,
  });
  await audit(tx, ctx, { action: "request.cancel_rejected", entityType: "request", entityId: cr.requestId, reason: note });
}
