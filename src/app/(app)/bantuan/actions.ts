"use server";

import { getActor } from "@/server/auth/current";
import { runAction } from "@/server/action";
import { addTicketComment, createTicket, deleteFaq, saveFaq, updateTicket } from "@/server/modules/support/service";

export async function createTicketAction(input: Parameters<typeof createTicket>[1]) {
  return runAction(async () => createTicket(await getActor(), input), "Tiket dikirim. Admin akan menindaklanjuti.");
}

export async function addTicketCommentAction(ticketId: string, body: string, isInternal = false) {
  return runAction(async () => addTicketComment(await getActor(), ticketId, body, isInternal), "Tanggapan dikirim.");
}

export async function updateTicketAction(ticketId: string, input: Parameters<typeof updateTicket>[2]) {
  return runAction(async () => updateTicket(await getActor(), ticketId, input), "Tiket diperbarui.");
}

export async function saveFaqAction(id: string | null, input: Parameters<typeof saveFaq>[2]) {
  return runAction(async () => saveFaq(await getActor(), id, input), "FAQ disimpan.");
}

export async function deleteFaqAction(id: string) {
  return runAction(async () => deleteFaq(await getActor(), id), "FAQ dihapus.");
}
