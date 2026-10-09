/**
 * Mesin persetujuan generik.
 *
 * - Satu mesin dipakai untuk pengajuan, perubahan (harga/qty/spesifikasi),
 *   pembatalan, dan penyelesaian masalah barang.
 * - Aturan dipilih dari matriks (approval_rules). Jika tidak ada atau ambigu,
 *   proses DITAHAN — sistem tidak menebak.
 * - Approver di-snapshot sebagai assignment, sehingga perubahan konfigurasi
 *   tidak mengubah proses yang sedang berjalan.
 * - Tidak ada auto-approve/auto-reject karena terlambat.
 */
import type { Tx } from "@/server/db";
import type { ActorContext } from "@/server/context";
import type {
  ApprovalDecisionType,
  ApprovalSubjectType,
  ApproverType,
  RoleScope,
  RoutingMode,
  StepApprovalMode,
  StepCondition,
} from "@/generated/prisma/enums";
import { Decimal } from "@/server/money";
import { addHours } from "@/server/time";
import { getSettings } from "@/server/settings";
import { notify } from "@/server/notifications/notify";
import { ForbiddenError, RuleError, ValidationError } from "@/server/errors";
import { APPROVAL_SUBJECT } from "@/lib/status";

export interface ApprovalSubject {
  subjectType: ApprovalSubjectType;
  requestId: string;
  requestVersionId?: string | null;
  changeRequestId?: string | null;
  cancellationRequestId?: string | null;
  discrepancyId?: string | null;
  /** Nilai untuk pencocokan ambang aturan. */
  amount: Decimal;
  overBudget?: boolean;
  /** Pengguna yang memulai proses (dikecualikan dari approver - pemisahan tugas). */
  initiatorId: string;
  /** Untuk REQUEST: instance sebelumnya yang approval-nya boleh dibawa (lihat requests service). */
  carryOverFromInstanceId?: string | null;
}

export interface StartResult {
  instanceId: string;
  status: "IN_PROGRESS" | "ON_HOLD" | "APPROVED";
  holdReason?: string;
  ruleName?: string;
}

interface RuleStepLike {
  id: string | null;
  stepNumber: number;
  name: string;
  approverType: ApproverType;
  approverUserId: string | null;
  approverRoleId: string | null;
  roleScope: RoleScope;
  approvalMode: StepApprovalMode;
  condition: StepCondition;
  isRequired: boolean;
  dueHours: number | null;
}

interface RuleLike {
  id: string | null;
  name: string;
  routingMode: RoutingMode;
  steps: RuleStepLike[];
}

/** Aturan bawaan untuk perubahan setelah disetujui (PRD FR-CHG-02) jika admin belum membuat aturan. */
const BUILTIN_CHANGE_RULE: RuleLike = {
  id: null,
  name: "Bawaan: persetujuan pemohon + atasan pemohon",
  routingMode: "PARALLEL",
  steps: [
    {
      id: null,
      stepNumber: 1,
      name: "Pemohon",
      approverType: "REQUESTER",
      approverUserId: null,
      approverRoleId: null,
      roleScope: "ANY_DEPARTMENT",
      approvalMode: "ALL",
      condition: "ALWAYS",
      isRequired: true,
      dueHours: null,
    },
    {
      id: null,
      stepNumber: 2,
      name: "Atasan langsung pemohon",
      approverType: "REQUESTER_SUPERVISOR",
      approverUserId: null,
      approverRoleId: null,
      roleScope: "ANY_DEPARTMENT",
      approvalMode: "ALL",
      condition: "ALWAYS",
      isRequired: true,
      dueHours: null,
    },
  ],
};

async function loadRequestContext(tx: Tx, requestId: string) {
  return tx.request.findUniqueOrThrow({
    where: { id: requestId },
    include: {
      requester: {
        include: { employee: { include: { supervisor: { include: { user: true } } } } },
      },
      department: { include: { headUser: true } },
    },
  });
}

type RequestContext = Awaited<ReturnType<typeof loadRequestContext>>;

async function selectRule(tx: Tx, subject: ApprovalSubject, req: RequestContext): Promise<{ rule?: RuleLike; problem?: string }> {
  const now = new Date();
  const rules = await tx.approvalRule.findMany({
    where: {
      subjectType: subject.subjectType,
      isActive: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
    },
    include: { steps: { orderBy: { stepNumber: "asc" } } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  const matching = rules.filter(
    (r) =>
      (!r.requestType || r.requestType === req.requestType) &&
      (!r.departmentId || r.departmentId === req.departmentId) &&
      (r.minAmount === null || subject.amount.gte(r.minAmount)) &&
      (r.maxAmount === null || subject.amount.lte(r.maxAmount)),
  );
  if (matching.length === 0) {
    if (subject.subjectType === "CHANGE_REQUEST") return { rule: BUILTIN_CHANGE_RULE };
    return { problem: "Tidak ada aturan persetujuan yang cocok. Admin perlu melengkapi matriks persetujuan." };
  }
  const top = matching[0];
  const ties = matching.filter((r) => r.priority === top.priority);
  if (ties.length > 1) {
    return {
      problem: `Lebih dari satu aturan cocok dengan prioritas sama (${ties.map((t) => t.code).join(", ")}). Admin perlu menetapkan prioritas.`,
    };
  }
  if (top.steps.length === 0) {
    return { problem: `Aturan "${top.name}" belum memiliki tahap persetujuan.` };
  }
  return { rule: { id: top.id, name: top.name, routingMode: top.routingMode, steps: top.steps } };
}

async function resolveApprovers(
  tx: Tx,
  step: RuleStepLike,
  req: RequestContext,
): Promise<{ userIds: string[]; problem?: string }> {
  switch (step.approverType) {
    case "USER": {
      if (!step.approverUserId) return { userIds: [], problem: "approver belum ditentukan" };
      const u = await tx.user.findUnique({ where: { id: step.approverUserId } });
      if (!u || u.accountStatus !== "ACTIVE") return { userIds: [], problem: `approver (${u?.fullName ?? "?"}) tidak aktif` };
      return { userIds: [u.id] };
    }
    case "ROLE": {
      if (!step.approverRoleId) return { userIds: [], problem: "peran approver belum ditentukan" };
      const users = await tx.user.findMany({
        where: {
          accountStatus: "ACTIVE",
          roles: { some: { roleId: step.approverRoleId } },
          ...(step.roleScope === "REQUESTER_DEPARTMENT"
            ? {
                OR: [
                  { employee: { departmentId: req.departmentId } },
                  { departmentScopes: { some: { departmentId: req.departmentId, accessLevel: "APPROVE" } } },
                ],
              }
            : {}),
        },
        select: { id: true },
        orderBy: { fullName: "asc" },
      });
      if (users.length === 0) return { userIds: [], problem: "tidak ada pengguna aktif dengan peran tersebut" };
      return { userIds: users.map((u) => u.id) };
    }
    case "REQUESTER_SUPERVISOR": {
      const sup = req.requester.employee?.supervisor?.user;
      if (!sup) return { userIds: [], problem: "atasan langsung pemohon belum diatur" };
      if (sup.accountStatus !== "ACTIVE") return { userIds: [], problem: `atasan pemohon (${sup.fullName}) tidak aktif` };
      return { userIds: [sup.id] };
    }
    case "DEPARTMENT_HEAD": {
      const head = req.department.headUser;
      if (!head) return { userIds: [], problem: `kepala bagian ${req.department.name} belum diatur` };
      if (head.accountStatus !== "ACTIVE") return { userIds: [], problem: `kepala bagian (${head.fullName}) tidak aktif` };
      return { userIds: [head.id] };
    }
    case "REQUESTER": {
      if (req.requester.accountStatus !== "ACTIVE") return { userIds: [], problem: "akun pemohon tidak aktif" };
      return { userIds: [req.requesterId] };
    }
  }
}

/** Memulai proses persetujuan untuk sebuah subjek. */
export async function startApproval(tx: Tx, ctx: ActorContext, subject: ApprovalSubject): Promise<StartResult> {
  const req = await loadRequestContext(tx, subject.requestId);
  const { rule, problem } = await selectRule(tx, subject, req);

  const base = {
    subjectType: subject.subjectType,
    requestId: subject.requestId,
    requestVersionId: subject.requestVersionId ?? null,
    changeRequestId: subject.changeRequestId ?? null,
    cancellationRequestId: subject.cancellationRequestId ?? null,
    discrepancyId: subject.discrepancyId ?? null,
  };

  if (!rule) {
    const instance = await tx.approvalInstance.create({
      data: { ...base, routingMode: "SEQUENTIAL", status: "ON_HOLD", holdReason: problem },
    });
    return { instanceId: instance.id, status: "ON_HOLD", holdReason: problem };
  }

  // Resolusi approver per tahap.
  const planned: Array<{ step: RuleStepLike; userIds: string[]; skippedNote?: string }> = [];
  for (const step of rule.steps) {
    if (step.condition === "OVER_BUDGET" && !subject.overBudget) continue;
    const resolved = await resolveApprovers(tx, step, req);
    let userIds = resolved.userIds;
    let note = resolved.problem;
    if (step.approverType !== "REQUESTER") {
      // Pemisahan tugas: pemohon/pemrakarsa tidak menyetujui prosesnya sendiri.
      const before = userIds.length;
      userIds = userIds.filter((id) => id !== req.requesterId && id !== subject.initiatorId);
      if (before > 0 && userIds.length === 0) note = "approver adalah pemohon/pemrakarsa sendiri (pemisahan tugas)";
    } else if (subject.subjectType !== "REQUEST") {
      userIds = userIds.filter((id) => id !== subject.initiatorId || id === req.requesterId);
    }
    if (userIds.length === 0) {
      if (step.isRequired) {
        const reason = `Tahap ${step.stepNumber} "${step.name}": ${note ?? "approver tidak ditemukan"}.`;
        const instance = await tx.approvalInstance.create({
          data: { ...base, ruleId: rule.id, routingMode: rule.routingMode, status: "ON_HOLD", holdReason: reason },
        });
        return { instanceId: instance.id, status: "ON_HOLD", holdReason: reason, ruleName: rule.name };
      }
      planned.push({ step, userIds: [], skippedNote: `Dilewati: ${note ?? "approver tidak ditemukan"}` });
      continue;
    }
    planned.push({ step, userIds });
  }

  if (planned.every((p) => p.userIds.length === 0)) {
    const reason = `Aturan "${rule.name}" tidak menghasilkan approver untuk pengajuan ini.`;
    const instance = await tx.approvalInstance.create({
      data: { ...base, ruleId: rule.id, routingMode: rule.routingMode, status: "ON_HOLD", holdReason: reason },
    });
    return { instanceId: instance.id, status: "ON_HOLD", holdReason: reason, ruleName: rule.name };
  }

  // Persetujuan yang dapat dibawa dari proses sebelumnya (aturan sama, tahap sama, sudah setuju).
  const carried = new Map<string, Array<{ approverUserId: string; decisionId: string | null }>>();
  if (subject.carryOverFromInstanceId && rule.id) {
    const prev = await tx.approvalInstance.findUnique({
      where: { id: subject.carryOverFromInstanceId },
      include: { steps: { include: { assignments: { include: { decisions: true } } } } },
    });
    if (prev && prev.ruleId === rule.id) {
      for (const s of prev.steps) {
        if (s.status !== "APPROVED" || !s.ruleStepId) continue;
        const approvers = s.assignments
          .filter((a) => a.status === "APPROVED" || a.status === "CARRIED_OVER")
          .map((a) => ({
            approverUserId: a.approverUserId,
            decisionId: a.decisions.find((d) => d.decision === "APPROVE")?.id ?? a.carriedFromDecisionId,
          }));
        if (approvers.length) carried.set(s.ruleStepId, approvers);
      }
    }
  }

  const instance = await tx.approvalInstance.create({
    data: { ...base, ruleId: rule.id, routingMode: rule.routingMode, status: "IN_PROGRESS" },
  });

  for (const p of planned) {
    const carry = p.step.id ? carried.get(p.step.id) : undefined;
    const status = p.userIds.length === 0 ? "SKIPPED" : carry ? "APPROVED" : "WAITING";
    const created = await tx.approvalStep.create({
      data: {
        instanceId: instance.id,
        ruleStepId: p.step.id,
        stepNumber: p.step.stepNumber,
        name: p.step.name,
        approvalMode: p.step.approvalMode,
        status,
        startedAt: status === "WAITING" ? null : new Date(),
        completedAt: status === "WAITING" ? null : new Date(),
      },
    });
    if (carry) {
      for (const c of carry) {
        await tx.approvalAssignment.create({
          data: {
            stepId: created.id,
            approverUserId: c.approverUserId,
            status: "CARRIED_OVER",
            carriedFromDecisionId: c.decisionId,
            note: "Disetujui pada versi sebelumnya; tidak terdampak perubahan.",
          },
        });
      }
    } else if (p.userIds.length > 0) {
      for (const userId of p.userIds) {
        await tx.approvalAssignment.create({ data: { stepId: created.id, approverUserId: userId, status: "WAITING" } });
      }
    } else if (p.skippedNote) {
      await tx.approvalStep.update({ where: { id: created.id }, data: { name: `${p.step.name} — ${p.skippedNote}` } });
    }
  }

  const status = await activateNext(tx, ctx, instance.id);
  return { instanceId: instance.id, status, ruleName: rule.name };
}

/**
 * Mengaktifkan tahap berikutnya (berjenjang) atau semua tahap (paralel).
 * Menandai instance APPROVED jika tidak ada tahap tersisa.
 */
async function activateNext(tx: Tx, ctx: ActorContext, instanceId: string): Promise<"IN_PROGRESS" | "APPROVED"> {
  const instance = await tx.approvalInstance.findUniqueOrThrow({
    where: { id: instanceId },
    include: {
      steps: { orderBy: { stepNumber: "asc" }, include: { assignments: true, ruleStep: { select: { dueHours: true } } } },
      request: { select: { id: true, requestNumber: true, title: true } },
    },
  });
  const remaining = instance.steps.filter((s) => s.status === "WAITING" || s.status === "PENDING");
  if (remaining.length === 0) {
    await tx.approvalInstance.update({ where: { id: instanceId }, data: { status: "APPROVED", completedAt: new Date() } });
    return "APPROVED";
  }
  const toActivate =
    instance.routingMode === "PARALLEL"
      ? remaining.filter((s) => s.status === "WAITING")
      : remaining[0].status === "WAITING"
        ? [remaining[0]]
        : [];
  const settings = await getSettings();
  const now = new Date();
  for (const step of toActivate) {
    await tx.approvalStep.update({ where: { id: step.id }, data: { status: "PENDING", startedAt: now } });
    for (const a of step.assignments.filter((x) => x.status === "WAITING")) {
      const dueHours = step.ruleStep?.dueHours ?? settings["approval.default_due_hours"];
      await tx.approvalAssignment.update({
        where: { id: a.id },
        data: { status: "PENDING", activatedAt: now, dueAt: dueHours ? addHours(now, dueHours) : null },
      });
      const label = APPROVAL_SUBJECT[instance.subjectType];
      await notify(tx, {
        recipientIds: [a.approverUserId],
        type: instance.subjectType === "CHANGE_REQUEST" ? "CHANGE_APPROVAL_REQUIRED" : "APPROVAL_REQUIRED",
        title: `Perlu persetujuan: ${instance.request.requestNumber ?? ""} ${instance.request.title}`.trim(),
        body: `${label} menunggu keputusan Anda pada tahap "${step.name}".`,
        link: `/persetujuan/${a.id}`,
        requestId: instance.request.id,
        mandatory: true,
      });
    }
  }
  return "IN_PROGRESS";
}

export interface DecideResult {
  outcome: "PENDING" | "APPROVED" | "REJECTED";
  instanceId: string;
  subjectType: ApprovalSubjectType;
  requestId: string;
  changeRequestId: string | null;
  cancellationRequestId: string | null;
  discrepancyId: string | null;
}

/** Mencatat keputusan approver. Dipanggil di dalam transaksi. */
export async function decide(
  tx: Tx,
  ctx: ActorContext,
  assignmentId: string,
  decision: ApprovalDecisionType,
  comment?: string | null,
): Promise<DecideResult> {
  const probe = await tx.approvalAssignment.findUnique({
    where: { id: assignmentId },
    select: { step: { select: { instanceId: true } } },
  });
  if (!probe) throw new RuleError("Penugasan persetujuan tidak ditemukan.");
  // Serialisasi keputusan per instance agar mode ALL/ANY dievaluasi konsisten.
  await tx.$queryRaw`SELECT "id" FROM "approval_instances" WHERE "id" = ${probe.step.instanceId}::uuid FOR UPDATE`;

  const assignment = await tx.approvalAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { step: { include: { instance: true } } },
  });
  const instance = assignment.step.instance;
  if (assignment.approverUserId !== ctx.user.id) {
    throw new ForbiddenError("Hanya approver yang ditugaskan yang dapat memberi keputusan.");
  }
  if (assignment.status !== "PENDING" || assignment.step.status !== "PENDING" || instance.status !== "IN_PROGRESS") {
    throw new RuleError("Penugasan ini sudah tidak menunggu keputusan.");
  }
  const trimmed = comment?.trim() || null;
  if (decision === "REJECT" && !trimmed) {
    throw new ValidationError("Alasan penolakan wajib diisi.", { comment: "Alasan penolakan wajib diisi." });
  }

  const now = new Date();
  await tx.approvalDecision.create({
    data: { assignmentId, decision, comment: trimmed, decidedById: ctx.user.id, decidedAt: now },
  });
  await tx.approvalAssignment.update({
    where: { id: assignmentId },
    data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED" },
  });

  const result: DecideResult = {
    outcome: "PENDING",
    instanceId: instance.id,
    subjectType: instance.subjectType,
    requestId: instance.requestId,
    changeRequestId: instance.changeRequestId,
    cancellationRequestId: instance.cancellationRequestId,
    discrepancyId: instance.discrepancyId,
  };

  if (decision === "REJECT") {
    await tx.approvalStep.update({ where: { id: assignment.stepId }, data: { status: "REJECTED", completedAt: now } });
    await closeOpenParts(tx, instance.id, "Tidak diperlukan karena proses ditolak.");
    await tx.approvalInstance.update({ where: { id: instance.id }, data: { status: "REJECTED", completedAt: now } });
    return { ...result, outcome: "REJECTED" };
  }

  const stepAssignments = await tx.approvalAssignment.findMany({ where: { stepId: assignment.stepId } });
  const active = stepAssignments.filter((a) => !["CANCELLED", "SKIPPED", "REASSIGNED"].includes(a.status));
  const stepApproved =
    assignment.step.approvalMode === "ANY" || active.every((a) => a.status === "APPROVED" || a.status === "CARRIED_OVER");

  if (stepApproved) {
    await tx.approvalStep.update({ where: { id: assignment.stepId }, data: { status: "APPROVED", completedAt: now } });
    await tx.approvalAssignment.updateMany({
      where: { stepId: assignment.stepId, status: { in: ["PENDING", "WAITING"] } },
      data: { status: "CANCELLED", note: "Tidak diperlukan: tahap sudah disetujui." },
    });
    const status = await activateNext(tx, ctx, instance.id);
    if (status === "APPROVED") return { ...result, outcome: "APPROVED" };
  }
  return result;
}

async function closeOpenParts(tx: Tx, instanceId: string, note: string) {
  const steps = await tx.approvalStep.findMany({ where: { instanceId }, select: { id: true } });
  const stepIds = steps.map((s) => s.id);
  await tx.approvalAssignment.updateMany({
    where: { stepId: { in: stepIds }, status: { in: ["PENDING", "WAITING"] } },
    data: { status: "CANCELLED", note },
  });
  await tx.approvalStep.updateMany({
    where: { instanceId, status: { in: ["PENDING", "WAITING"] } },
    data: { status: "CANCELLED", completedAt: new Date() },
  });
}

/** Menghentikan proses yang berjalan/ditahan (mis. pengajuan ditarik atau dibatalkan). */
export async function cancelApproval(tx: Tx, instanceId: string, note = "Proses dihentikan."): Promise<void> {
  const inst = await tx.approvalInstance.findUnique({ where: { id: instanceId } });
  if (!inst || (inst.status !== "IN_PROGRESS" && inst.status !== "ON_HOLD")) return;
  await closeOpenParts(tx, instanceId, note);
  await tx.approvalInstance.update({ where: { id: instanceId }, data: { status: "CANCELLED", completedAt: new Date() } });
}

/** Instance aktif (berjalan/ditahan) untuk subjek tertentu. */
export async function findActiveInstance(
  tx: Tx,
  where: { requestId: string; subjectType: ApprovalSubjectType; changeRequestId?: string; cancellationRequestId?: string; discrepancyId?: string },
) {
  return tx.approvalInstance.findFirst({
    where: { ...where, status: { in: ["IN_PROGRESS", "ON_HOLD"] } },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Mengalihkan penugasan yang masih menunggu ke pengguna lain (admin, tercatat audit).
 * Tidak ada delegasi otomatis.
 */
export async function reassignAssignment(tx: Tx, ctx: ActorContext, assignmentId: string, newUserId: string) {
  const a = await tx.approvalAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { step: { include: { instance: { include: { request: true } } } } },
  });
  if (a.status !== "PENDING" && a.status !== "WAITING") throw new RuleError("Hanya penugasan yang belum diputuskan yang dapat dialihkan.");
  if (newUserId === a.step.instance.request.requesterId && a.step.instance.subjectType === "REQUEST") {
    throw new RuleError("Pemohon tidak dapat menjadi approver pengajuannya sendiri.");
  }
  const target = await tx.user.findUnique({ where: { id: newUserId } });
  if (!target || target.accountStatus !== "ACTIVE") throw new RuleError("Pengguna tujuan tidak aktif.");
  await tx.approvalAssignment.update({ where: { id: a.id }, data: { status: "REASSIGNED", note: `Dialihkan ke ${target.fullName}` } });
  const created = await tx.approvalAssignment.create({
    data: {
      stepId: a.stepId,
      approverUserId: newUserId,
      status: a.status,
      reassignedFromId: a.id,
      activatedAt: a.activatedAt,
      dueAt: a.dueAt,
    },
  });
  if (a.status === "PENDING") {
    await notify(tx, {
      recipientIds: [newUserId],
      type: "APPROVAL_REQUIRED",
      title: `Perlu persetujuan: ${a.step.instance.request.requestNumber ?? ""} ${a.step.instance.request.title}`.trim(),
      body: `Penugasan persetujuan dialihkan kepada Anda oleh ${ctx.user.fullName}.`,
      link: `/persetujuan/${created.id}`,
      requestId: a.step.instance.requestId,
      mandatory: true,
    });
  }
  return created;
}
