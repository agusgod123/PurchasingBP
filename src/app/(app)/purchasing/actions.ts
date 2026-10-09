"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActor } from "@/server/auth/current";
import { runAction } from "@/server/action";
import { PERMISSIONS } from "@/lib/permissions";
import {
  addFollowup,
  addPoComment,
  addQuote,
  cancelPurchaseOrder,
  closePurchaseOrder,
  createPurchaseOrder,
  deleteQuote,
  markOrdered,
  markReady,
  proposeQuantityReduction,
  revertToDraft,
  selectQuote,
  updatePurchaseOrder,
  type FollowupInput,
  type PoLineInput,
} from "@/server/modules/purchasing/service";
import { proposeResolution, recordReceipt, reportShortage, type ReceiptLineInput } from "@/server/modules/receiving/service";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { transaction } from "@/server/idempotency";
import { ValidationError } from "@/server/errors";
import type { ResolutionType } from "@/generated/prisma/enums";

export async function createPoAction(input: { lines: PoLineInput[]; vendorId?: string | null; title?: string | null }, idempotencyKey: string) {
  return runAction(async () => {
    const ctx = await getActor();
    const res = await createPurchaseOrder(ctx, input, idempotencyKey);
    revalidatePath("/purchasing");
    return res;
  }, "PO dibuat.");
}

export async function updatePoAction(poId: string, input: Parameters<typeof updatePurchaseOrder>[2]) {
  return runAction(async () => {
    const ctx = await getActor();
    return updatePurchaseOrder(ctx, poId, input);
  }, "Perubahan PO disimpan.");
}

export async function addQuoteAction(poId: string, input: Parameters<typeof addQuote>[2]) {
  return runAction(async () => {
    const ctx = await getActor();
    return addQuote(ctx, poId, input);
  }, "Penawaran ditambahkan. Unggah berkas penawaran pada daftar.");
}

export async function selectQuoteAction(quoteId: string, note?: string) {
  return runAction(async () => {
    const ctx = await getActor();
    await selectQuote(ctx, quoteId, note);
    return null;
  }, "Penawaran dipilih dan vendor PO diperbarui.");
}

export async function deleteQuoteAction(quoteId: string) {
  return runAction(async () => {
    const ctx = await getActor();
    await deleteQuote(ctx, quoteId);
    return null;
  }, "Penawaran dihapus.");
}

export async function markReadyAction(poId: string, reason?: string) {
  return runAction(async () => {
    const ctx = await getActor();
    return markReady(ctx, poId, reason);
  });
}

export async function revertToDraftAction(poId: string) {
  return runAction(async () => {
    const ctx = await getActor();
    await revertToDraft(ctx, poId);
    return null;
  }, "PO dikembalikan ke draf.");
}

export async function markOrderedAction(poId: string, input: Parameters<typeof markOrdered>[2]) {
  return runAction(async () => {
    const ctx = await getActor();
    await markOrdered(ctx, poId, input);
    return null;
  }, "PO ditandai sudah dipesan. Pemohon telah diberi tahu.");
}

export async function addFollowupAction(poId: string, input: FollowupInput) {
  return runAction(async () => {
    const ctx = await getActor();
    return addFollowup(ctx, poId, input);
  }, "Tindak lanjut dicatat.");
}

export async function cancelPoAction(poId: string, reason: string) {
  return runAction(async () => {
    const ctx = await getActor();
    await cancelPurchaseOrder(ctx, poId, reason);
    return null;
  }, "PO dibatalkan. Item kembali ke antrean.");
}

export async function closePoAction(poId: string) {
  return runAction(async () => {
    const ctx = await getActor();
    await closePurchaseOrder(ctx, poId);
    return null;
  }, "PO ditutup.");
}

export async function recordReceiptAction(
  poId: string,
  input: { receivedAt?: string | null; deliveryNoteNumber?: string | null; notes?: string | null; lines: ReceiptLineInput[] },
  idempotencyKey: string,
) {
  return runAction(async () => {
    const ctx = await getActor();
    return recordReceipt(ctx, poId, input, idempotencyKey);
  });
}

export async function reportShortageAction(poId: string, poItemId: string, quantity: string, description: string) {
  return runAction(async () => {
    const ctx = await getActor();
    return reportShortage(ctx, poId, poItemId, quantity, description);
  }, "Kekurangan dicatat. Ajukan penyelesaiannya.");
}

export async function proposeResolutionAction(discrepancyId: string, resolutionType: ResolutionType, note: string) {
  return runAction(async () => {
    const ctx = await getActor();
    return proposeResolution(ctx, discrepancyId, { resolutionType, note });
  });
}

export async function reduceQuantityAction(requestItemId: string, newQuantity: string, reason: string) {
  return runAction(async () => {
    const ctx = await getActor();
    return proposeQuantityReduction(ctx, requestItemId, newQuantity, reason);
  });
}

export async function addPoCommentAction(poId: string, body: string) {
  return runAction(async () => {
    const ctx = await getActor();
    await addPoComment(ctx, poId, body);
    return null;
  }, "Catatan disimpan.");
}

// ---------------------------------------------------------------------------
// Vendor (data dasar yang dibutuhkan transaksi; bukan manajemen vendor penuh)
// ---------------------------------------------------------------------------

const vendorSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi").max(50),
  name: z.string().trim().min(2, "Nama wajib diisi").max(255),
  contactPerson: z.string().trim().max(150).optional().or(z.literal("")),
  email: z.string().trim().email("Email tidak valid").max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  address: z.string().trim().max(2000).optional().or(z.literal("")),
  taxNumber: z.string().trim().max(50).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

export async function saveVendorAction(id: string | null, input: z.input<typeof vendorSchema>) {
  return runAction(async () => {
    const ctx = await getActor(PERMISSIONS.VENDOR_MANAGE);
    const data = vendorSchema.parse(input);
    const clean = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])) as typeof data;
    const dup = await db.vendor.findFirst({ where: { code: data.code, ...(id ? { id: { not: id } } : {}) } });
    if (dup) throw new ValidationError("Kode vendor sudah dipakai.", { code: "Sudah dipakai" });
    return transaction(async (tx) => {
      const before = id ? await tx.vendor.findUnique({ where: { id } }) : null;
      const v = id ? await tx.vendor.update({ where: { id }, data: clean }) : await tx.vendor.create({ data: clean });
      await audit(tx, ctx, { action: id ? "vendor.update" : "vendor.create", entityType: "vendor", entityId: v.id, oldValues: before, newValues: clean });
      return { id: v.id };
    });
  }, "Vendor disimpan.");
}
