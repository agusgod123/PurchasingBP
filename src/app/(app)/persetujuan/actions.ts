"use server";

import { getActor } from "@/server/auth/current";
import { runAction } from "@/server/action";
import { decideAssignment } from "@/server/modules/approvals/decide";
import { reassignAssignment } from "@/server/modules/approvals/engine";
import { transaction } from "@/server/idempotency";
import { audit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/permissions";
import type { Priority } from "@/generated/prisma/enums";

export async function decideAction(assignmentId: string, input: { decision: "APPROVE" | "REJECT"; comment?: string; finalPriority?: Priority | null }) {
  return runAction(async () => {
    const ctx = await getActor();
    const res = await decideAssignment(ctx, assignmentId, input);
    return { outcome: res.outcome, requestId: res.requestId };
  });
}

export async function reassignAction(assignmentId: string, newUserId: string, reason: string) {
  return runAction(async () => {
    const ctx = await getActor(PERMISSIONS.APPROVAL_REASSIGN);
    await transaction(async (tx) => {
      await reassignAssignment(tx, ctx, assignmentId, newUserId);
      await audit(tx, ctx, { action: "approval.reassign", entityType: "approval_assignment", entityId: assignmentId, newValues: { newUserId }, reason });
    });
    return null;
  }, "Penugasan dialihkan.");
}
