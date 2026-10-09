import type { ActorContext } from "@/server/context";
import type { ApprovalDecisionType, Priority } from "@/generated/prisma/enums";
import { transaction } from "@/server/idempotency";
import { audit } from "@/server/audit";
import { decide } from "@/server/modules/approvals/engine";
import { onRequestApproved, onRequestRejected, setFinalPriority } from "@/server/modules/requests/service";
import { onChangeApproved, onChangeRejected } from "@/server/modules/purchasing/service";
import { applyCancellation, rejectCancellation } from "@/server/modules/cancellation/service";
import { applyResolution, onResolutionRejected } from "@/server/modules/receiving/service";

/**
 * Orkestrator keputusan: mencatat keputusan di mesin persetujuan lalu
 * menjalankan akibatnya pada subjek (pengajuan, perubahan, pembatalan, masalah barang).
 */
export async function decideAssignment(
  ctx: ActorContext,
  assignmentId: string,
  input: { decision: ApprovalDecisionType; comment?: string | null; finalPriority?: Priority | null },
) {
  return transaction(async (tx) => {
    const result = await decide(tx, ctx, assignmentId, input.decision, input.comment);
    if (input.finalPriority && result.subjectType === "REQUEST") {
      await setFinalPriority(tx, ctx, result.requestId, input.finalPriority);
    }
    await tx.request.update({ where: { id: result.requestId }, data: { lastActivityAt: new Date() } });
    await audit(tx, ctx, {
      action: input.decision === "APPROVE" ? "approval.approve" : "approval.reject",
      entityType: "approval_assignment",
      entityId: assignmentId,
      newValues: { subject: result.subjectType, outcome: result.outcome },
      reason: input.comment ?? null,
    });

    if (result.outcome === "PENDING") return result;
    const approved = result.outcome === "APPROVED";
    switch (result.subjectType) {
      case "REQUEST":
        if (approved) await onRequestApproved(tx, ctx, result.requestId);
        else await onRequestRejected(tx, ctx, result.requestId, input.comment ?? null);
        break;
      case "CHANGE_REQUEST":
        if (approved) await onChangeApproved(tx, ctx, result.changeRequestId!);
        else await onChangeRejected(tx, ctx, result.changeRequestId!, input.comment ?? null);
        break;
      case "CANCELLATION":
        if (approved) await applyCancellation(tx, ctx, result.cancellationRequestId!);
        else await rejectCancellation(tx, ctx, result.cancellationRequestId!, input.comment ?? null);
        break;
      case "DISCREPANCY_RESOLUTION":
        if (approved) await applyResolution(tx, ctx, result.discrepancyId!);
        else await onResolutionRejected(tx, ctx, result.discrepancyId!, input.comment ?? null);
        break;
    }
    return result;
  });
}
