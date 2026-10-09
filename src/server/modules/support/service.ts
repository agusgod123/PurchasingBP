import { z } from "zod";
import type { ActorContext } from "@/server/context";
import { audit } from "@/server/audit";
import { transaction } from "@/server/idempotency";
import { DOC_PREFIX, nextNumber } from "@/server/numbering";
import { notify } from "@/server/notifications/notify";
import { can } from "@/server/auth/user";
import { PERMISSIONS } from "@/lib/permissions";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { db } from "@/server/db";

const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const CATEGORIES = ["TECHNICAL", "PROCESS", "ACCOUNT", "OTHER"] as const;
const STATUSES = ["OPEN", "IN_PROGRESS", "FORWARDED", "RESOLVED", "CLOSED"] as const;

export const ticketSchema = z.object({
  subject: z.string().trim().min(5, "Judul minimal 5 karakter").max(255),
  description: z.string().trim().min(10, "Jelaskan masalah minimal 10 karakter").max(5000),
  category: z.enum(CATEGORIES),
  urgency: z.enum(PRIORITIES),
  relatedRequestNumber: z.string().trim().max(50).optional().or(z.literal("")),
});

async function supportUsers() {
  return db.user.findMany({
    where: { accountStatus: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { code: PERMISSIONS.SUPPORT_MANAGE } } } } } } },
    select: { id: true },
  });
}

export async function createTicket(ctx: ActorContext, input: z.input<typeof ticketSchema>) {
  const data = ticketSchema.parse(input);
  return transaction(async (tx) => {
    const related = data.relatedRequestNumber ? await tx.request.findUnique({ where: { requestNumber: data.relatedRequestNumber } }) : null;
    if (data.relatedRequestNumber && !related) throw new ValidationError("Nomor pengajuan tidak ditemukan.", { relatedRequestNumber: "Tidak ditemukan" });
    const ticketNumber = await nextNumber(tx, DOC_PREFIX.TICKET);
    const t = await tx.supportTicket.create({
      data: {
        ticketNumber,
        reporterId: ctx.user.id,
        subject: data.subject,
        description: data.description,
        category: data.category,
        urgency: data.urgency,
        relatedRequestId: related?.id ?? null,
      },
    });
    await notify(tx, {
      recipientIds: (await supportUsers()).map((u) => u.id),
      type: "TICKET_UPDATE",
      title: `Tiket baru ${ticketNumber}: ${data.subject}`,
      body: `${ctx.user.fullName} · urgensi ${data.urgency}`,
      link: `/bantuan/tiket/${t.id}`,
      excludeUserId: ctx.user.id,
    });
    await audit(tx, ctx, { action: "ticket.create", entityType: "support_ticket", entityId: t.id });
    return { id: t.id, ticketNumber };
  });
}

export async function addTicketComment(ctx: ActorContext, ticketId: string, body: string, isInternal = false) {
  const text = body.trim();
  if (!text) throw new ValidationError("Komentar tidak boleh kosong.");
  const manager = can(ctx.user, PERMISSIONS.SUPPORT_MANAGE);
  return transaction(async (tx) => {
    const t = await tx.supportTicket.findUnique({ where: { id: ticketId } });
    if (!t) throw new NotFoundError();
    if (t.reporterId !== ctx.user.id && !manager) throw new ForbiddenError();
    await tx.supportTicketComment.create({ data: { ticketId, authorId: ctx.user.id, body: text.slice(0, 5000), isInternal: manager && isInternal } });
    await tx.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
    if (!(manager && isInternal)) {
      await notify(tx, {
        recipientIds: t.reporterId === ctx.user.id ? [t.assigneeId ?? null, ...(t.assigneeId ? [] : (await supportUsers()).map((u) => u.id))] : [t.reporterId],
        type: "TICKET_UPDATE",
        title: `Tanggapan tiket ${t.ticketNumber}`,
        body: `${ctx.user.fullName}: ${text.slice(0, 200)}`,
        link: `/bantuan/tiket/${t.id}`,
        excludeUserId: ctx.user.id,
      });
    }
  });
}

export const ticketUpdateSchema = z.object({
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES).nullable(),
  assigneeId: z.string().uuid().nullable(),
  forwardedTo: z.string().trim().max(255).nullable(),
});

/** Admin menetapkan prioritas akhir, penanggung jawab, meneruskan, dan menutup tiket (FR-HLP-02/05). */
export async function updateTicket(ctx: ActorContext, ticketId: string, input: z.input<typeof ticketUpdateSchema>) {
  if (!can(ctx.user, PERMISSIONS.SUPPORT_MANAGE)) throw new ForbiddenError();
  const data = ticketUpdateSchema.parse(input);
  return transaction(async (tx) => {
    const t = await tx.supportTicket.findUnique({ where: { id: ticketId } });
    if (!t) throw new NotFoundError();
    await tx.supportTicket.update({
      where: { id: ticketId },
      data: {
        ...data,
        resolvedAt: data.status === "RESOLVED" && !t.resolvedAt ? new Date() : t.resolvedAt,
      },
    });
    if (t.status !== data.status) {
      await notify(tx, {
        recipientIds: [t.reporterId],
        type: "TICKET_UPDATE",
        title: `Status tiket ${t.ticketNumber} diperbarui`,
        body: `Status: ${data.status}${data.forwardedTo ? ` · diteruskan ke ${data.forwardedTo}` : ""}`,
        link: `/bantuan/tiket/${t.id}`,
        excludeUserId: ctx.user.id,
      });
    }
    await audit(tx, ctx, { action: "ticket.update", entityType: "support_ticket", entityId: t.id, oldValues: { status: t.status, priority: t.priority }, newValues: data });
  });
}

export const faqSchema = z.object({
  category: z.string().trim().min(2).max(100),
  question: z.string().trim().min(5).max(500),
  answer: z.string().trim().min(5).max(10000),
  sortOrder: z.coerce.number().int().default(0),
  isPublished: z.boolean().default(true),
});

export async function saveFaq(ctx: ActorContext, id: string | null, input: z.input<typeof faqSchema>) {
  if (!can(ctx.user, PERMISSIONS.FAQ_MANAGE)) throw new ForbiddenError();
  const data = faqSchema.parse(input);
  return transaction(async (tx) => {
    const row = id ? await tx.faqArticle.update({ where: { id }, data }) : await tx.faqArticle.create({ data });
    await audit(tx, ctx, { action: id ? "faq.update" : "faq.create", entityType: "faq", entityId: row.id });
    return { id: row.id };
  });
}

export async function deleteFaq(ctx: ActorContext, id: string) {
  if (!can(ctx.user, PERMISSIONS.FAQ_MANAGE)) throw new ForbiddenError();
  return transaction(async (tx) => {
    await tx.faqArticle.delete({ where: { id } });
    await audit(tx, ctx, { action: "faq.delete", entityType: "faq", entityId: id });
  });
}
