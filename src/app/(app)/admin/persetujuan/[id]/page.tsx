import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/server/auth/current";
import { db } from "@/server/db";
import { PageHeader } from "@/components/app/ui";
import { PERMISSIONS } from "@/lib/permissions";
import { RuleEditor } from "../rules-client";
import { EMPTY_RULE, type RuleForm } from "../rule-form";

export const metadata: Metadata = { title: "Aturan Persetujuan" };

export default async function RuleEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.APPROVAL_RULE_MANAGE);
  const { id } = await params;
  const isNew = id === "baru";
  const rule = isNew
    ? null
    : await db.approvalRule
        .findUnique({ where: { id }, include: { steps: { orderBy: { stepNumber: "asc" } }, _count: { select: { instances: true } } } })
        .catch(() => null);
  if (!isNew && !rule) notFound();
  const [departments, users, roles] = await Promise.all([
    db.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { accountStatus: "ACTIVE" }, orderBy: { fullName: "asc" }, include: { employee: { include: { department: true } } } }),
    db.role.findMany({ orderBy: { name: "asc" } }),
  ]);
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const initial: RuleForm = rule
    ? {
        code: rule.code,
        name: rule.name,
        description: rule.description ?? "",
        subjectType: rule.subjectType,
        requestType: rule.requestType,
        departmentId: rule.departmentId,
        minAmount: rule.minAmount ? rule.minAmount.toFixed(0) : "",
        maxAmount: rule.maxAmount ? rule.maxAmount.toFixed(0) : "",
        priority: String(rule.priority),
        routingMode: rule.routingMode,
        isActive: rule.isActive,
        effectiveFrom: day(rule.effectiveFrom),
        effectiveUntil: day(rule.effectiveUntil),
        steps: rule.steps.map((s) => ({
          name: s.name,
          approverType: s.approverType,
          approverUserId: s.approverUserId,
          approverRoleId: s.approverRoleId,
          roleScope: s.roleScope,
          approvalMode: s.approvalMode,
          condition: s.condition,
          dueHours: s.dueHours ? String(s.dueHours) : "",
        })),
      }
    : EMPTY_RULE;
  return (
    <>
      <PageHeader
        back={{ href: "/admin/persetujuan", label: "Matriks Persetujuan" }}
        title={rule ? rule.name : "Aturan baru"}
        description={rule?.isSample ? "Ini aturan CONTOH. Sesuaikan dengan matriks kewenangan resmi sebelum diaktifkan." : undefined}
      />
      <RuleEditor
        id={rule?.id ?? null}
        initial={initial}
        usedCount={rule?._count.instances ?? 0}
        departments={departments.map((d) => ({ value: d.id, label: d.name, hint: d.code }))}
        users={users.map((u) => ({ value: u.id, label: u.fullName, hint: [u.employee?.positionName, u.employee?.department.name].filter(Boolean).join(" · ") || u.username }))}
        roles={roles.map((r) => ({ value: r.id, label: r.name }))}
      />
    </>
  );
}
