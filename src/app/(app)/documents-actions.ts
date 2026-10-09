"use server";

import { getActor } from "@/server/auth/current";
import { runAction } from "@/server/action";
import { completeUpload, deleteDocument, requestUpload, type UploadRequest } from "@/server/modules/documents/service";

export async function requestUploadAction(input: UploadRequest) {
  return runAction(async () => {
    const ctx = await getActor();
    return requestUpload(ctx, input);
  });
}

export async function completeUploadAction(documentId: string) {
  return runAction(async () => {
    const ctx = await getActor();
    return completeUpload(ctx, documentId);
  }, "Dokumen berhasil diunggah.");
}

export async function deleteDocumentAction(documentId: string, reason?: string) {
  return runAction(async () => {
    const ctx = await getActor();
    await deleteDocument(ctx, documentId, reason);
    return null;
  }, "Dokumen dihapus.");
}
