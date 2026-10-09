import { z } from "zod";
import type { ActorContext } from "@/server/context";
import { audit } from "@/server/audit";
import { transaction } from "@/server/idempotency";
import { can } from "@/server/auth/user";
import { dec } from "@/server/money";
import { ForbiddenError, NotFoundError, RuleError, ValidationError } from "@/server/errors";
import { PERMISSIONS } from "@/lib/permissions";

function requireRuleManage(ctx: ActorContext) {
  if (!can(ctx.user, PERMISSIONS.APPROVAL_RULE_MANAGE)) throw new ForbiddenError();
}

const money = z
  .union([z.string(), z.number()])
  .nullable()
  .transform((v) => (v === null || v === "" ? null : String(v)))
  .refine((v) => v === null || /^\d+(\.\d{1,2})?$/.test(v), "Nominal tidak valid");

export const ruleStepSchema = z
  .object({
    name: z.string().trim().min(2, "Nama tahap wajib diisi").max(150),
    approverType: z.enum(["USER", "ROLE", "REQUESTER_SUPERVISOR", "DEPARTMENT_HEAD", "REQUESTER"]),
    approverUserId: z.string().uuid().nullable(),
    approverRoleId: z.string().uuid().nullable(),
    roleScope: z.enum(["ANY_DEPARTMENT", "REQUESTER_DEPARTMENT"]),
    approvalMode: z.enum(["ALL", "ANY"]),
    condition: z.enum(["ALWAYS", "OVER_BUDGET"]),
    dueHours: z.coerce.number().int().min(1).max(720).nullable(),
  })
  .superRefine((s, ctx) => {
    if (s.approverType === "USER" && !s.approverUserId) ctx.addIssue({ code: "custom", path: ["approverUserId"], message: "Pilih pengguna" });
    if (s.approverType === "ROLE" && !s.approverRoleId) ctx.addIssue({ code: "custom", path: ["approverRoleId"], message: "Pilih peran" });
  });

export const ruleSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,100}$/, "Huruf besar, angka, - atau _"),
    name: z.string().trim().min(3, "Nama wajib diisi").max(150),
    description: z.string().trim().max(1000).nullable(),
    subjectType: z.enum(["REQUEST", "CHANGE_REQUEST", "CANCELLATION", "DISCREPANCY_RESOLUTION"]),
    requestType: z.enum(["GOODS", "SERVICE"]).nullable(),
    departmentId: z.string().uuid().nullable(),
    minAmount: money,
    maxAmount: money,
    priority: z.coerce.number().int().min(0).max(1000),
    routingMode: z.enum(["SEQUENTIAL", "PARALLEL"]),
    isActive: z.boolean(),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    effectiveUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    steps: z.array(ruleStepSchema).min(1, "Minimal satu tahap persetujuan").max(10),
  })
  .superRefine((r, ctx) => {
    if (r.minAmount && r.maxAmount && dec(r.minAmount).gt(r.maxAmount)) {
      ctx.addIssue({ code: "custom", path: ["maxAmount"], message: "Batas atas harus ≥ batas bawah" });
    }
    if (r.effectiveFrom && r.effectiveUntil && r.effectiveUntil <= r.effectiveFrom) {
      ctx.addIssue({ code: "custom", path: ["effectiveUntil"], message: "Harus setelah tanggal mulai" });
    }
  });

export type RuleInput = z.input<typeof ruleSchema>;

const overlaps = (aMin: string | null, aMax: string | null, bMin: { toString(): string } | null, bMax: { toString(): string } | null) => {
  const lo1 = aMin ? dec(aMin) : dec(0);
  const hi1 = aMax ? dec(aMax) : null;
  const lo2 = bMin ? dec(bMin.toString()) : dec(0);
  const hi2 = bMax ? dec(bMax.toString()) : null;
  return (hi2 === null || lo1.lte(hi2)) && (hi1 === null || lo2.lte(hi1));
};

/** Menyimpan aturan beserta tahapnya. Proses yang sedang berjalan tidak terpengaruh (approver sudah di-snapshot). */
export async function saveApprovalRule(ctx: ActorContext, id: string | null, input: RuleInput) {
  requireRuleManage(ctx);
  const data = ruleSchema.parse(input);
  return transaction(async (tx) => {
    const before = id ? await tx.approvalRule.findUnique({ where: { id }, include: { steps: true } }) : null;
    if (id && !before) throw new NotFoundError();
    const dupe = await tx.approvalRule.findFirst({ where: { code: data.code, ...(id ? { id: { not: id } } : {}) } });
    if (dupe) throw new ValidationError("Kode aturan sudah dipakai.", { code: "Sudah digunakan" });

    const fields = {
      code: data.code,
      name: data.name,
      description: data.description || null,
      subjectType: data.subjectType,
      requestType: data.requestType,
      departmentId: data.departmentId,
      minAmount: data.minAmount,
      maxAmount: data.maxAmount,
      priority: data.priority,
      routingMode: data.routingMode,
      isActive: data.isActive,
      // Aturan contoh yang sudah ditinjau & disimpan admin bukan lagi "contoh".
      isSample: false,
      effectiveFrom: data.effectiveFrom ? new Date(`${data.effectiveFrom}T00:00:00Z`) : (before?.effectiveFrom ?? new Date()),
      effectiveUntil: data.effectiveUntil ? new Date(`${data.effectiveUntil}T00:00:00Z`) : null,
    };
    const rule = id
      ? await tx.approvalRule.update({ where: { id }, data: fields })
      : await tx.approvalRule.create({ data: { ...fields, createdById: ctx.user.id } });
    await tx.approvalRuleStep.deleteMany({ where: { ruleId: rule.id } });
    for (const [i, s] of data.steps.entries()) {
      await tx.approvalRuleStep.create({
        data: {
          ruleId: rule.id,
          stepNumber: i + 1,
          name: s.name,
          approverType: s.approverType,
          approverUserId: s.approverType === "USER" ? s.approverUserId : null,
          approverRoleId: s.approverType === "ROLE" ? s.approverRoleId : null,
          roleScope: s.roleScope,
          approvalMode: s.approvalMode,
          condition: s.condition,
          dueHours: s.dueHours,
        },
      });
    }

    // Peringatan: aturan aktif lain dengan prioritas sama yang cakupannya beririsan → pengajuan akan DITAHAN (ambigu).
    const warnings: string[] = [];
    if (data.isActive) {
      const peers = await tx.approvalRule.findMany({
        where: { id: { not: rule.id }, isActive: true, subjectType: data.subjectType, priority: data.priority },
      });
      for (const p of peers) {
        const sameType = !p.requestType || !data.requestType || p.requestType === data.requestType;
        const sameDept = !p.departmentId || !data.departmentId || p.departmentId === data.departmentId;
        if (sameType && sameDept && overlaps(data.minAmount, data.maxAmount, p.minAmount, p.maxAmount)) {
          warnings.push(`Beririsan dengan "${p.name}" pada prioritas yang sama — pengajuan yang cocok keduanya akan ditahan.`);
        }
      }
    }
    await audit(tx, ctx, {
      action: id ? "approval_rule.update" : "approval_rule.create",
      entityType: "approval_rule",
      entityId: rule.id,
      oldValues: before ? { ...before, steps: before.steps.length } : null,
      newValues: { ...fields, steps: data.steps.length },
    });
    return { id: rule.id, warnings };
  });
}

export async function setRuleActive(ctx: ActorContext, id: string, isActive: boolean) {
  requireRuleManage(ctx);
  return transaction(async (tx) => {
    const rule = await tx.approvalRule.findUnique({ where: { id }, include: { _count: { select: { steps: true } } } });
    if (!rule) throw new NotFoundError();
    if (isActive && rule._count.steps === 0) throw new RuleError("Aturan tanpa tahap tidak dapat diaktifkan.");
    await tx.approvalRule.update({ where: { id }, data: { isActive } });
    await audit(tx, ctx, { action: isActive ? "approval_rule.activate" : "approval_rule.deactivate", entityType: "approval_rule", entityId: id });
  });
}

export async function deleteApprovalRule(ctx: ActorContext, id: string) {
  requireRuleManage(ctx);
  return transaction(async (tx) => {
    const rule = await tx.approvalRule.findUnique({ where: { id }, include: { _count: { select: { instances: true } } } });
    if (!rule) throw new NotFoundError();
    if (rule._count.instances > 0) throw new RuleError("Aturan sudah pernah dipakai. Nonaktifkan saja agar riwayat tetap utuh.");
    await tx.approvalRule.delete({ where: { id } });
    await audit(tx, ctx, { action: "approval_rule.delete", entityType: "approval_rule", entityId: id, oldValues: { code: rule.code, name: rule.name } });
  });
}
