import { z } from "zod";
import type { ActorContext } from "@/server/context";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/server/audit";
import { transaction } from "@/server/idempotency";
import { can } from "@/server/auth/user";
import { invalidateSettingsCache } from "@/server/settings";
import { DEFAULT_SETTINGS, type Settings } from "@/server/settings-defaults";
import { ForbiddenError, NotFoundError, RuleError, ValidationError } from "@/server/errors";
import { PERMISSIONS, type PermissionCode } from "@/lib/permissions";
import { DOCUMENT_STAGE, DOCUMENT_TYPE, REQUEST_STATUS } from "@/lib/status";
import { NOTIFICATION_TYPES } from "@/server/notifications/notify";

function requirePerm(ctx: ActorContext, p: PermissionCode) {
  if (!can(ctx.user, p)) throw new ForbiddenError();
}

const optionalMoney = z
  .union([z.string(), z.number()])
  .nullable()
  .transform((v) => (v === null || v === "" ? null : String(v)))
  .refine((v) => v === null || /^\d+(\.\d{1,2})?$/.test(v), "Nominal tidak valid");

// --- Dokumen wajib ------------------------------------------------------------

export const documentRequirementSchema = z.object({
  stage: z.enum(Object.keys(DOCUMENT_STAGE) as [keyof typeof DOCUMENT_STAGE, ...Array<keyof typeof DOCUMENT_STAGE>]),
  documentType: z.enum(Object.keys(DOCUMENT_TYPE) as [keyof typeof DOCUMENT_TYPE, ...Array<keyof typeof DOCUMENT_TYPE>]),
  minCount: z.coerce.number().int().min(1).max(20),
  minAmount: optionalMoney,
  description: z.string().trim().max(500).nullable(),
  isActive: z.boolean(),
});

export async function saveDocumentRequirement(ctx: ActorContext, id: string | null, input: z.input<typeof documentRequirementSchema>) {
  requirePerm(ctx, PERMISSIONS.SETTINGS_MANAGE);
  const data = documentRequirementSchema.parse(input);
  return transaction(async (tx) => {
    const before = id ? await tx.documentRequirement.findUnique({ where: { id } }) : null;
    if (id && !before) throw new NotFoundError();
    const row = id ? await tx.documentRequirement.update({ where: { id }, data }) : await tx.documentRequirement.create({ data });
    await audit(tx, ctx, { action: id ? "doc_requirement.update" : "doc_requirement.create", entityType: "document_requirement", entityId: row.id, oldValues: before, newValues: data });
    return { id: row.id };
  });
}

export async function deleteDocumentRequirement(ctx: ActorContext, id: string) {
  requirePerm(ctx, PERMISSIONS.SETTINGS_MANAGE);
  return transaction(async (tx) => {
    const before = await tx.documentRequirement.findUnique({ where: { id } });
    if (!before) throw new NotFoundError();
    await tx.documentRequirement.delete({ where: { id } });
    await audit(tx, ctx, { action: "doc_requirement.delete", entityType: "document_requirement", entityId: id, oldValues: before });
  });
}

// --- Katalog ------------------------------------------------------------------

export const categorySchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,20}$/, "2–20 karakter: huruf, angka, - atau _"),
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(500).nullable(),
  sortOrder: z.coerce.number().int().min(0).max(999),
  isActive: z.boolean(),
});

export async function saveCategory(ctx: ActorContext, id: string | null, input: z.input<typeof categorySchema>) {
  requirePerm(ctx, PERMISSIONS.CATALOG_MANAGE);
  const data = categorySchema.parse(input);
  return transaction(async (tx) => {
    const dupe = await tx.itemCategory.findFirst({ where: { code: data.code, ...(id ? { id: { not: id } } : {}) } });
    if (dupe) throw new ValidationError("Kode sudah dipakai.", { code: "Sudah digunakan" });
    const row = id ? await tx.itemCategory.update({ where: { id }, data }) : await tx.itemCategory.create({ data });
    await audit(tx, ctx, { action: id ? "category.update" : "category.create", entityType: "item_category", entityId: row.id, newValues: data });
    return { id: row.id };
  });
}

export const catalogItemSchema = z.object({
  categoryId: z.string().uuid("Pilih kategori"),
  code: z.string().trim().toUpperCase().max(100).nullable(),
  name: z.string().trim().min(2, "Nama wajib diisi").max(255),
  description: z.string().trim().max(2000).nullable(),
  itemType: z.enum(["GOODS", "SERVICE"]),
  unitName: z.string().trim().min(1, "Satuan wajib diisi").max(50),
  defaultEstimatedPrice: optionalMoney,
  isActive: z.boolean(),
});

export async function saveCatalogItem(ctx: ActorContext, id: string | null, input: z.input<typeof catalogItemSchema>) {
  requirePerm(ctx, PERMISSIONS.CATALOG_MANAGE);
  const data = catalogItemSchema.parse(input);
  const clean = { ...data, code: data.code || null, description: data.description || null };
  return transaction(async (tx) => {
    if (clean.code) {
      const dupe = await tx.catalogItem.findFirst({ where: { code: clean.code, ...(id ? { id: { not: id } } : {}) } });
      if (dupe) throw new ValidationError("Kode sudah dipakai.", { code: "Sudah digunakan" });
    }
    const row = id ? await tx.catalogItem.update({ where: { id }, data: clean }) : await tx.catalogItem.create({ data: clean });
    await audit(tx, ctx, { action: id ? "catalog.update" : "catalog.create", entityType: "catalog_item", entityId: row.id, newValues: clean });
    return { id: row.id };
  });
}

// --- Anggaran -----------------------------------------------------------------

export const budgetSchema = z.object({
  departmentId: z.string().uuid(),
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  amount: z
    .union([z.string(), z.number()])
    .transform(String)
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Nominal tidak valid"),
  notes: z.string().trim().max(500).nullable(),
});

export async function saveBudget(ctx: ActorContext, input: z.input<typeof budgetSchema>) {
  requirePerm(ctx, PERMISSIONS.BUDGET_MANAGE);
  const data = budgetSchema.parse(input);
  return transaction(async (tx) => {
    const key = { departmentId_fiscalYear: { departmentId: data.departmentId, fiscalYear: data.fiscalYear } };
    const before = await tx.departmentBudget.findUnique({ where: key });
    const row = await tx.departmentBudget.upsert({
      where: key,
      create: { ...data, createdById: ctx.user.id },
      update: { amount: data.amount, notes: data.notes },
    });
    await audit(tx, ctx, { action: "budget.save", entityType: "department_budget", entityId: row.id, oldValues: before ? { amount: before.amount.toString() } : null, newValues: { amount: data.amount, fiscalYear: data.fiscalYear } });
    return { id: row.id };
  });
}

export async function deleteBudget(ctx: ActorContext, id: string) {
  requirePerm(ctx, PERMISSIONS.BUDGET_MANAGE);
  return transaction(async (tx) => {
    const before = await tx.departmentBudget.findUnique({ where: { id } });
    if (!before) throw new NotFoundError();
    await tx.departmentBudget.delete({ where: { id } });
    await audit(tx, ctx, { action: "budget.delete", entityType: "department_budget", entityId: id, oldValues: { amount: before.amount.toString(), fiscalYear: before.fiscalYear } });
  });
}

// --- Hari libur ---------------------------------------------------------------

export const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  name: z.string().trim().min(2, "Keterangan wajib diisi").max(150),
});

export async function addHoliday(ctx: ActorContext, input: z.input<typeof holidaySchema>) {
  requirePerm(ctx, PERMISSIONS.SETTINGS_MANAGE);
  const data = holidaySchema.parse(input);
  return transaction(async (tx) => {
    const date = new Date(`${data.date}T00:00:00Z`);
    if (await tx.holiday.findUnique({ where: { date } })) throw new ValidationError("Tanggal sudah terdaftar.", { date: "Sudah ada" });
    const row = await tx.holiday.create({ data: { date, name: data.name } });
    await audit(tx, ctx, { action: "holiday.create", entityType: "holiday", entityId: row.id, newValues: data });
    return { id: row.id };
  });
}

export async function deleteHoliday(ctx: ActorContext, id: string) {
  requirePerm(ctx, PERMISSIONS.SETTINGS_MANAGE);
  return transaction(async (tx) => {
    const before = await tx.holiday.findUnique({ where: { id } });
    if (!before) throw new NotFoundError();
    await tx.holiday.delete({ where: { id } });
    await audit(tx, ctx, { action: "holiday.delete", entityType: "holiday", entityId: id, oldValues: { date: before.date.toISOString().slice(0, 10), name: before.name } });
  });
}

// --- Pengaturan ---------------------------------------------------------------

const settingsSchema = z.object({
  "app.organization_name": z.string().trim().min(2).max(150),
  "approval.reapproval_policy": z.enum(["AFFECTED_ONLY", "FULL"]),
  "approval.default_due_hours": z.coerce.number().int().min(1).max(720),
  "approval.reminder_interval_hours": z.coerce.number().int().min(1).max(720),
  "approval.escalation_after_hours": z.coerce.number().int().min(1).max(2160),
  "purchasing.stale_after_days": z.coerce.number().int().min(1).max(365),
  "purchasing.price_tolerance_percent": z.coerce.number().min(0).max(100),
  "documents.max_file_mb": z.coerce.number().int().min(1).max(50),
  "documents.allowed_mime_types": z.array(z.string().trim().regex(/^[\w.+-]+\/[\w.+-]+$/, "Format MIME tidak valid")).min(1),
  "documents.requester_visible_types": z.array(z.enum(Object.keys(DOCUMENT_TYPE) as [string, ...string[]])),
  "budget.warning_enabled": z.boolean(),
  "work_calendar.start_hour": z.coerce.number().int().min(0).max(23),
  "work_calendar.end_hour": z.coerce.number().int().min(1).max(24),
  "work_calendar.work_days": z.array(z.number().int().min(1).max(7)).min(1, "Pilih minimal satu hari kerja"),
  "notifications.email_types": z.array(z.enum(Object.keys(NOTIFICATION_TYPES) as [string, ...string[]])),
  "request.requester_cancel_statuses": z.array(z.enum(Object.keys(REQUEST_STATUS) as [string, ...string[]])),
});

export async function saveSettings(ctx: ActorContext, input: Partial<Settings>) {
  requirePerm(ctx, PERMISSIONS.SETTINGS_MANAGE);
  const data = settingsSchema.partial().parse(input);
  const start = data["work_calendar.start_hour"];
  const end = data["work_calendar.end_hour"];
  if (start !== undefined && end !== undefined && end <= start) {
    throw new ValidationError("Jam selesai harus setelah jam mulai.", { "work_calendar.end_hour": "Harus setelah jam mulai" });
  }
  await transaction(async (tx) => {
    const before = await tx.systemSetting.findMany({ where: { key: { in: Object.keys(data) } } });
    for (const [key, value] of Object.entries(data)) {
      if (!(key in DEFAULT_SETTINGS)) continue;
      await tx.systemSetting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedById: ctx.user.id },
        update: { value: value as Prisma.InputJsonValue, updatedById: ctx.user.id },
      });
    }
    await audit(tx, ctx, {
      action: "settings.update",
      entityType: "system_setting",
      entityId: null,
      oldValues: Object.fromEntries(before.map((b) => [b.key, b.value])),
      newValues: data,
    });
  });
  invalidateSettingsCache();
}

// --- Email keluar ---------------------------------------------------------------

export async function retryEmail(ctx: ActorContext, id: string) {
  requirePerm(ctx, PERMISSIONS.SETTINGS_MANAGE);
  return transaction(async (tx) => {
    const row = await tx.emailOutbox.findUnique({ where: { id } });
    if (!row) throw new NotFoundError();
    if (row.status === "SENT") throw new RuleError("Email sudah terkirim.");
    await tx.emailOutbox.update({ where: { id }, data: { status: "PENDING", nextAttemptAt: new Date(), lockedUntil: null } });
    await audit(tx, ctx, { action: "email.retry", entityType: "email_outbox", entityId: id });
  });
}

export async function queueTestEmail(ctx: ActorContext, to: string) {
  requirePerm(ctx, PERMISSIONS.SETTINGS_MANAGE);
  const email = z.string().trim().email("Email tidak valid").parse(to);
  return transaction(async (tx) => {
    const row = await tx.emailOutbox.create({
      data: {
        toEmail: email,
        subject: "Uji coba email e-Pengadaan",
        textBody: "Jika Anda menerima email ini, pengaturan SMTP aplikasi sudah benar.",
      },
    });
    await audit(tx, ctx, { action: "email.test", entityType: "email_outbox", entityId: row.id, newValues: { to: email } });
    return { id: row.id };
  });
}
