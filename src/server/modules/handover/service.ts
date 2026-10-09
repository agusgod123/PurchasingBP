import type { ActorContext } from "@/server/context";
import { audit } from "@/server/audit";
import { transaction, withIdempotency } from "@/server/idempotency";
import { DOC_PREFIX, nextNumber } from "@/server/numbering";
import { dec } from "@/server/money";
import { notify } from "@/server/notifications/notify";
import { can } from "@/server/auth/user";
import { PERMISSIONS } from "@/lib/permissions";
import { ForbiddenError, NotFoundError, RuleError, ValidationError } from "@/server/errors";
import { itemFulfilment, setRequestStatus } from "@/server/modules/requests/service";
import { checkDocumentRequirements, unmetMessages } from "@/server/modules/documents/requirements";

/**
 * Purchasing menyiapkan serah terima kepada pemohon. Hanya dapat dilakukan
 * setelah seluruh pesanan lengkap / pengecualian diselesaikan (FR-RCV-06).
 */
export async function prepareHandover(
  ctx: ActorContext,
  requestId: string,
  input: { location?: string | null; notes?: string | null; items?: Array<{ requestItemId: string; quantity: string | number }> },
  idempotencyKey?: string,
) {
  if (!can(ctx.user, PERMISSIONS.PURCHASING_MANAGE)) throw new ForbiddenError();
  return withIdempotency(ctx.user.id, idempotencyKey, `handover.prepare:${requestId}`, async (tx) => {
    const req = await tx.request.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundError();
    if (req.status !== "READY_FOR_HANDOVER") {
      throw new RuleError("Serah terima hanya dapat disiapkan setelah seluruh barang diterima dan masalah diselesaikan.");
    }
    const receipts = await tx.goodsReceipt.findMany({
      where: { purchaseOrder: { requestLinks: { some: { requestId } }, status: { not: "CANCELLED" } } },
      select: { id: true },
    });
    const receiptChecks = await checkDocumentRequirements(tx, "RECEIPT", { goodsReceiptIds: receipts.map((r) => r.id) });
    const unmet = unmetMessages(receiptChecks);
    if (unmet.length) throw new RuleError(`Dokumen penerimaan belum lengkap: ${unmet.join("; ")}.`);

    const fulfil = await itemFulfilment(tx, requestId);
    const requested = input.items?.length
      ? input.items
      : fulfil
          .filter((f) => f.received.minus(f.handedOver).gt(0))
          .map((f) => ({ requestItemId: f.requestItemId, quantity: f.received.minus(f.handedOver).toString() }));
    if (!requested.length) throw new RuleError("Tidak ada barang yang dapat diserahkan.");
    const handoverNumber = await nextNumber(tx, DOC_PREFIX.HANDOVER);
    const handover = await tx.handover.create({
      data: {
        handoverNumber,
        requestId,
        location: input.location?.trim() || null,
        notes: input.notes?.trim() || null,
        preparedById: ctx.user.id,
      },
    });
    for (const item of requested) {
      const f = fulfil.find((x) => x.requestItemId === item.requestItemId);
      if (!f) throw new ValidationError("Item tidak valid.");
      const qty = dec(item.quantity);
      const available = f.received.minus(f.handedOver);
      if (qty.lte(0)) continue;
      if (qty.gt(available)) {
        throw new ValidationError(`Jumlah serah terima melebihi barang yang tersedia (${available.toString()}).`);
      }
      await tx.handoverItem.create({ data: { handoverId: handover.id, requestItemId: item.requestItemId, quantity: qty } });
    }
    await setRequestStatus(tx, ctx, requestId, "READY_FOR_HANDOVER", "AWAITING_CONFIRMATION", `Serah terima ${handoverNumber} disiapkan`);
    await notify(tx, {
      recipientIds: [req.requesterId],
      type: "HANDOVER_READY",
      title: `Barang siap diserahkan: ${req.requestNumber}`,
      body: `Purchasing menyiapkan serah terima ${handoverNumber}${input.location ? ` di ${input.location}` : ""}. Setelah menerima barang, konfirmasi di aplikasi.`,
      link: `/pengajuan/${requestId}`,
      requestId,
      mandatory: true,
    });
    await audit(tx, ctx, { action: "handover.prepare", entityType: "handover", entityId: handover.id, newValues: { handoverNumber, requestId } });
    return { id: handover.id, handoverNumber };
  });
}

/**
 * Pemohon mengonfirmasi penerimaan akhir. Jika ada selisih kuantitas, serah
 * terima ditandai bermasalah dan dikembalikan ke purchasing (FR-RCV-09).
 */
export async function confirmHandover(
  ctx: ActorContext,
  handoverId: string,
  input: { items: Array<{ handoverItemId: string; confirmedQuantity: string | number }>; note?: string | null },
) {
  return transaction(async (tx) => {
    const h = await tx.handover.findUnique({ where: { id: handoverId }, include: { request: true, items: true } });
    if (!h) throw new NotFoundError();
    if (h.request.requesterId !== ctx.user.id) throw new ForbiddenError("Hanya pemohon yang dapat mengonfirmasi serah terima.");
    if (h.status !== "PREPARED") throw new RuleError("Serah terima ini sudah diproses.");
    let disputed = false;
    for (const item of h.items) {
      const given = input.items.find((i) => i.handoverItemId === item.id);
      const confirmed = given ? dec(given.confirmedQuantity) : dec(item.quantity);
      if (confirmed.lt(0) || confirmed.gt(item.quantity)) throw new ValidationError("Jumlah konfirmasi tidak valid.");
      if (!confirmed.eq(item.quantity)) disputed = true;
      await tx.handoverItem.update({ where: { id: item.id }, data: { confirmedQuantity: confirmed } });
    }
    const note = input.note?.trim() || null;
    if (disputed) {
      if (!note) throw new ValidationError("Jelaskan selisih jumlah yang diterima.", { note: "Wajib diisi jika ada selisih" });
      await tx.handover.update({
        where: { id: h.id },
        data: { status: "DISPUTED", disputeReason: note, confirmedById: ctx.user.id, confirmedAt: new Date() },
      });
      // Item yang dikonfirmasi tetap tercatat; sisa kembali untuk ditangani purchasing.
      await setRequestStatus(tx, ctx, h.requestId, "AWAITING_CONFIRMATION", "READY_FOR_HANDOVER", `Selisih serah terima: ${note}`);
      const owners = await tx.purchaseOrder.findMany({
        where: { requestLinks: { some: { requestId: h.requestId } } },
        select: { purchasingOwnerId: true },
      });
      await notify(tx, {
        recipientIds: [h.preparedById, ...owners.map((o) => o.purchasingOwnerId)],
        type: "HANDOVER_DISPUTED",
        title: `Selisih serah terima ${h.handoverNumber}`,
        body: `${ctx.user.fullName}: ${note}`,
        link: `/pengajuan/${h.requestId}`,
        requestId: h.requestId,
        mandatory: true,
      });
      await audit(tx, ctx, { action: "handover.dispute", entityType: "handover", entityId: h.id, reason: note });
      return { status: "DISPUTED" as const };
    }

    const checks = await checkDocumentRequirements(tx, "HANDOVER_CONFIRM", { handoverId: h.id });
    const unmet = unmetMessages(checks);
    if (unmet.length) throw new RuleError(`Dokumen serah terima belum lengkap: ${unmet.join("; ")}.`);

    await tx.handover.update({
      where: { id: h.id },
      data: { status: "CONFIRMED", confirmedById: ctx.user.id, confirmedAt: new Date(), confirmationNote: note },
    });
    // Selesai jika seluruh kebutuhan sudah diserahkan.
    const fulfil = await itemFulfilment(tx, h.requestId);
    const complete = fulfil.every((f) => f.handedOver.gte(f.required));
    if (complete) {
      await setRequestStatus(tx, ctx, h.requestId, "AWAITING_CONFIRMATION", "COMPLETED", "Pemohon mengonfirmasi penerimaan", {
        completedAt: new Date(),
      });
    } else {
      await setRequestStatus(tx, ctx, h.requestId, "AWAITING_CONFIRMATION", "READY_FOR_HANDOVER", "Serah terima sebagian dikonfirmasi");
    }
    const owners = await tx.purchaseOrder.findMany({
      where: { requestLinks: { some: { requestId: h.requestId } }, status: { not: "CANCELLED" } },
      select: { purchasingOwnerId: true },
    });
    await notify(tx, {
      recipientIds: [h.preparedById, ...owners.map((o) => o.purchasingOwnerId)],
      type: complete ? "REQUEST_COMPLETED" : "HANDOVER_CONFIRMED",
      title: complete ? `Pengajuan selesai: ${h.request.requestNumber}` : `Serah terima dikonfirmasi: ${h.handoverNumber}`,
      body: complete
        ? "Pemohon telah mengonfirmasi penerimaan. PO terkait dapat ditutup bila semua pengajuannya selesai."
        : "Sebagian barang telah dikonfirmasi diterima.",
      link: `/pengajuan/${h.requestId}`,
      requestId: h.requestId,
    });
    await audit(tx, ctx, { action: "handover.confirm", entityType: "handover", entityId: h.id, newValues: { complete } });
    return { status: "CONFIRMED" as const, completed: complete };
  });
}

export async function cancelHandover(ctx: ActorContext, handoverId: string, reason: string) {
  if (!can(ctx.user, PERMISSIONS.PURCHASING_MANAGE)) throw new ForbiddenError();
  if (!reason?.trim()) throw new ValidationError("Alasan wajib diisi.");
  return transaction(async (tx) => {
    const h = await tx.handover.findUnique({ where: { id: handoverId } });
    if (!h) throw new NotFoundError();
    if (h.status !== "PREPARED") throw new RuleError("Hanya serah terima yang belum dikonfirmasi yang dapat dibatalkan.");
    await tx.handover.update({ where: { id: h.id }, data: { status: "CANCELLED", notes: `${h.notes ?? ""}\nDibatalkan: ${reason}`.trim() } });
    await setRequestStatus(tx, ctx, h.requestId, "AWAITING_CONFIRMATION", "READY_FOR_HANDOVER", `Serah terima dibatalkan: ${reason}`);
    await audit(tx, ctx, { action: "handover.cancel", entityType: "handover", entityId: h.id, reason });
  });
}
