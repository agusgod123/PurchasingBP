"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/server/auth/current";
import { runAction } from "@/server/action";
import {
  addRequestComment,
  createDraft,
  deleteDraft,
  rerouteRequest,
  setFinalPriority,
  submitRequest,
  updateDraft,
  withdrawRequest,
} from "@/server/modules/requests/service";
import { decideCancellation, requestCancellation } from "@/server/modules/cancellation/service";
import { cancelHandover, confirmHandover, prepareHandover } from "@/server/modules/handover/service";
import { removeStoredFiles } from "@/server/modules/documents/service";
import { transaction } from "@/server/idempotency";
import type { RequestDraftInput } from "@/lib/schemas/request";
import type { Priority } from "@/generated/prisma/enums";

export async function saveDraftAction(input: { id?: string; lockVersion?: number; data: RequestDraftInput; idempotencyKey?: string }) {
  return runAction(async () => {
    const ctx = await getActor();
    const res = input.id
      ? await updateDraft(ctx, input.id, input.data, input.lockVersion ?? 0)
      : await createDraft(ctx, input.data, input.idempotencyKey);
    revalidatePath("/pengajuan");
    return res;
  });
}

export async function submitRequestAction(input: { id: string; lockVersion: number; changeSummary?: string; idempotencyKey: string }) {
  return runAction(async () => {
    const ctx = await getActor();
    const res = await submitRequest(ctx, input.id, input);
    revalidatePath("/pengajuan");
    return res;
  });
}

export async function withdrawRequestAction(id: string, reason: string) {
  return runAction(async () => {
    const ctx = await getActor();
    await withdrawRequest(ctx, id, reason);
    return null;
  }, "Pengajuan ditarik dan kembali menjadi draf.");
}

export async function deleteDraftAction(id: string) {
  return runAction(async () => {
    const ctx = await getActor();
    const keys = await deleteDraft(ctx, id);
    await removeStoredFiles(keys);
    revalidatePath("/pengajuan");
    return null;
  }, "Draf dihapus.");
}

export async function cancelRequestAction(id: string, reason: string) {
  return runAction(async () => {
    const ctx = await getActor();
    const res = await requestCancellation(ctx, id, reason);
    return res;
  });
}

export async function decideCancellationAction(cancellationRequestId: string, approve: boolean, note?: string) {
  return runAction(async () => {
    const ctx = await getActor();
    await decideCancellation(ctx, cancellationRequestId, approve, note);
    return null;
  }, approve ? "Pengajuan dibatalkan." : "Usulan pembatalan ditolak.");
}

export async function rerouteRequestAction(id: string) {
  return runAction(async () => {
    const ctx = await getActor();
    return rerouteRequest(ctx, id);
  });
}

export async function addCommentAction(id: string, body: string) {
  return runAction(async () => {
    const ctx = await getActor();
    return addRequestComment(ctx, id, body);
  }, "Komentar ditambahkan.");
}

export async function setPriorityAction(id: string, priority: Priority) {
  return runAction(async () => {
    const ctx = await getActor();
    await transaction((tx) => setFinalPriority(tx, ctx, id, priority));
    return null;
  }, "Prioritas final disimpan.");
}

export async function prepareHandoverAction(
  requestId: string,
  input: { location?: string; notes?: string; items?: Array<{ requestItemId: string; quantity: string }> },
  idempotencyKey: string,
) {
  return runAction(async () => {
    const ctx = await getActor();
    return prepareHandover(ctx, requestId, input, idempotencyKey);
  }, "Serah terima disiapkan. Pemohon telah diberi tahu.");
}

export async function confirmHandoverAction(handoverId: string, items: Array<{ handoverItemId: string; confirmedQuantity: string }>, note?: string) {
  return runAction(async () => {
    const ctx = await getActor();
    return confirmHandover(ctx, handoverId, { items, note });
  });
}

export async function cancelHandoverAction(handoverId: string, reason: string) {
  return runAction(async () => {
    const ctx = await getActor();
    await cancelHandover(ctx, handoverId, reason);
    return null;
  }, "Serah terima dibatalkan.");
}
