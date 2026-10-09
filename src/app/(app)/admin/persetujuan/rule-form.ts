import type { APPROVAL_SUBJECT, APPROVER_TYPE } from "@/lib/status";

// Bentuk formulir aturan — dipakai bersama oleh halaman server dan editor client.

export type ApproverType = keyof typeof APPROVER_TYPE;

export interface StepForm {
  name: string;
  approverType: ApproverType;
  approverUserId: string | null;
  approverRoleId: string | null;
  roleScope: "ANY_DEPARTMENT" | "REQUESTER_DEPARTMENT";
  approvalMode: "ALL" | "ANY";
  condition: "ALWAYS" | "OVER_BUDGET";
  dueHours: string;
}

export interface RuleForm {
  code: string;
  name: string;
  description: string;
  subjectType: keyof typeof APPROVAL_SUBJECT;
  requestType: "GOODS" | "SERVICE" | null;
  departmentId: string | null;
  minAmount: string;
  maxAmount: string;
  priority: string;
  routingMode: "SEQUENTIAL" | "PARALLEL";
  isActive: boolean;
  effectiveFrom: string;
  effectiveUntil: string;
  steps: StepForm[];
}

export const newStep = (n: number): StepForm => ({
  name: n === 1 ? "Atasan langsung pemohon" : `Tahap ${n}`,
  approverType: n === 1 ? "REQUESTER_SUPERVISOR" : "DEPARTMENT_HEAD",
  approverUserId: null,
  approverRoleId: null,
  roleScope: "ANY_DEPARTMENT",
  approvalMode: "ALL",
  condition: "ALWAYS",
  dueHours: "",
});

export const EMPTY_RULE: RuleForm = {
  code: "",
  name: "",
  description: "",
  subjectType: "REQUEST",
  requestType: null,
  departmentId: null,
  minAmount: "",
  maxAmount: "",
  priority: "0",
  routingMode: "SEQUENTIAL",
  isActive: false,
  effectiveFrom: "",
  effectiveUntil: "",
  steps: [newStep(1)],
};

