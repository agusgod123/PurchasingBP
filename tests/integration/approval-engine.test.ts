import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createDraft, submitRequest, updateDraft, withdrawRequest, rerouteRequest } from "@/server/modules/requests/service";
import { decideAssignment } from "@/server/modules/approvals/decide";
import { attachDoc, createOrg, createRule, ctxOf, futureDate, pendingAssignmentFor, resetDatabase } from "../support/fixtures";

type Org = Awaited<ReturnType<typeof createOrg>>;
let org: Org;

async function newSubmittedRequest(total: { qty: string; price: string } = { qty: "2", price: "500000" }) {
  const ctx = await ctxOf(org.users.requester.id);
  const draft = await createDraft(ctx, {
    title: "Perlengkapan kerja tim",
    generalReason: "Kebutuhan operasional tim lapangan bulan depan",
    requestedPriority: "HIGH",
    neededDate: futureDate(),
    items: [{ itemName: "Helm safety", specification: "SNI, warna putih", quantity: total.qty, unitName: "buah", estimatedUnitPrice: total.price }],
  });
  await attachDoc({ requestId: draft.id }, "REQUEST_ATTACHMENT", org.users.requester.id);
  const res = await submitRequest(ctx, draft.id, { lockVersion: draft.lockVersion });
  return { ...res, ctx, draftId: draft.id };
}

beforeEach(async () => {
  await resetDatabase();
  org = await createOrg();
});

describe("mesin persetujuan", () => {
  it("menahan pengajuan jika tidak ada aturan yang cocok (tidak menebak)", async () => {
    const res = await newSubmittedRequest();
    expect(res.status).toBe("ON_HOLD");
    expect(res.holdReason).toMatch(/Tidak ada aturan/);
    const req = await db.request.findUniqueOrThrow({ where: { id: res.id } });
    expect(req.requestNumber).toMatch(/^PB-\d{4}-00001$/);
    expect(req.currentVersionNumber).toBe(1);
  });

  it("berjenjang: tahap 2 aktif setelah tahap 1 setuju, lalu masuk antrean", async () => {
    await createRule({
      name: "Standar",
      subjectType: "REQUEST",
      routingMode: "SEQUENTIAL",
      steps: {
        create: [
          { stepNumber: 1, name: "Atasan", approverType: "REQUESTER_SUPERVISOR" },
          { stepNumber: 2, name: "Keuangan", approverType: "ROLE", approverRole: { connect: { code: "FINANCE" } } },
        ],
      },
    });
    const res = await newSubmittedRequest();
    expect(res.status).toBe("PENDING_APPROVAL");

    // Keuangan belum punya tugas aktif.
    expect(await db.approvalAssignment.count({ where: { approverUserId: org.users.finance.id, status: "PENDING" } })).toBe(0);

    const a1 = await pendingAssignmentFor(org.users.supervisor.id, res.id);
    const out1 = await decideAssignment(await ctxOf(org.users.supervisor.id), a1.id, { decision: "APPROVE", finalPriority: "URGENT" });
    expect(out1.outcome).toBe("PENDING");

    const a2 = await pendingAssignmentFor(org.users.finance.id, res.id);
    const out2 = await decideAssignment(await ctxOf(org.users.finance.id), a2.id, { decision: "APPROVE" });
    expect(out2.outcome).toBe("APPROVED");

    const req = await db.request.findUniqueOrThrow({ where: { id: res.id } });
    expect(req.status).toBe("APPROVED");
    expect(req.finalPriority).toBe("URGENT");
    const notifs = await db.notification.count({ where: { recipientId: org.users.purchasing.id, type: "REQUEST_QUEUED" } });
    expect(notifs).toBe(1);
  });

  it("paralel: semua tahap aktif bersamaan dan semua harus setuju", async () => {
    await createRule({
      name: "Paralel",
      subjectType: "REQUEST",
      routingMode: "PARALLEL",
      steps: {
        create: [
          { stepNumber: 1, name: "Atasan", approverType: "REQUESTER_SUPERVISOR" },
          { stepNumber: 2, name: "Pimpinan", approverType: "ROLE", approverRole: { connect: { code: "LEADERSHIP" } } },
        ],
      },
    });
    const res = await newSubmittedRequest();
    await pendingAssignmentFor(org.users.supervisor.id, res.id);
    const leaderTask = await pendingAssignmentFor(org.users.leader.id, res.id);
    const out = await decideAssignment(await ctxOf(org.users.leader.id), leaderTask.id, { decision: "APPROVE" });
    expect(out.outcome).toBe("PENDING");
    const supTask = await pendingAssignmentFor(org.users.supervisor.id, res.id);
    const out2 = await decideAssignment(await ctxOf(org.users.supervisor.id), supTask.id, { decision: "APPROVE" });
    expect(out2.outcome).toBe("APPROVED");
  });

  it("mode ANY: cukup satu approver; tugas lain otomatis tidak diperlukan", async () => {
    await createRule({
      name: "Purchasing salah satu",
      subjectType: "REQUEST",
      steps: {
        create: [
          { stepNumber: 1, name: "Purchasing", approverType: "ROLE", approvalMode: "ANY", approverRole: { connect: { code: "PURCHASING" } } },
        ],
      },
    });
    const res = await newSubmittedRequest();
    const t = await pendingAssignmentFor(org.users.purchasing2.id, res.id);
    const out = await decideAssignment(await ctxOf(org.users.purchasing2.id), t.id, { decision: "APPROVE" });
    expect(out.outcome).toBe("APPROVED");
    const other = await db.approvalAssignment.findFirstOrThrow({ where: { approverUserId: org.users.purchasing.id } });
    expect(other.status).toBe("CANCELLED");
  });

  it("penolakan mengembalikan untuk revisi; kirim ulang tanpa kenaikan membawa persetujuan tahap sebelumnya", async () => {
    await createRule({
      name: "Dua tahap",
      subjectType: "REQUEST",
      steps: {
        create: [
          { stepNumber: 1, name: "Atasan", approverType: "REQUESTER_SUPERVISOR" },
          { stepNumber: 2, name: "Keuangan", approverType: "ROLE", approverRole: { connect: { code: "FINANCE" } } },
        ],
      },
    });
    const res = await newSubmittedRequest();
    const a1 = await pendingAssignmentFor(org.users.supervisor.id, res.id);
    await decideAssignment(await ctxOf(org.users.supervisor.id), a1.id, { decision: "APPROVE" });
    const a2 = await pendingAssignmentFor(org.users.finance.id, res.id);
    await expect(decideAssignment(await ctxOf(org.users.finance.id), a2.id, { decision: "REJECT" })).rejects.toThrow(/Alasan/);
    await decideAssignment(await ctxOf(org.users.finance.id), a2.id, { decision: "REJECT", comment: "Kurangi jumlah" });

    let req = await db.request.findUniqueOrThrow({ where: { id: res.id }, include: { items: true } });
    expect(req.status).toBe("REVISION_REQUIRED");

    // Revisi: kurangi jumlah (tidak menaikkan risiko) → tahap atasan dibawa.
    await updateDraft(res.ctx, res.id, {
      title: req.title,
      generalReason: req.generalReason,
      requestedPriority: "HIGH",
      neededDate: futureDate(),
      items: [{ id: req.items[0].id, itemName: "Helm safety", specification: "SNI, warna putih", quantity: "1", unitName: "buah", estimatedUnitPrice: "500000" }],
    }, req.lockVersion);
    req = await db.request.findUniqueOrThrow({ where: { id: res.id }, include: { items: true } });
    const res2 = await submitRequest(res.ctx, res.id, { lockVersion: req.lockVersion, changeSummary: "Jumlah dikurangi" });
    expect(res2.status).toBe("PENDING_APPROVAL");
    expect(await db.approvalAssignment.count({ where: { approverUserId: org.users.supervisor.id, status: "PENDING" } })).toBe(0);
    expect(await db.approvalAssignment.count({ where: { approverUserId: org.users.supervisor.id, status: "CARRIED_OVER" } })).toBe(1);
    await pendingAssignmentFor(org.users.finance.id, res.id);

    // Versi dan keputusan lama tetap tersimpan.
    expect(await db.requestVersion.count({ where: { requestId: res.id } })).toBe(2);
    expect(await db.approvalDecision.count({ where: { decision: "REJECT" } })).toBe(1);
  });

  it("pemisahan tugas: approver tahap = pemohon → ditahan; admin dapat memproses ulang setelah diperbaiki", async () => {
    await createRule({
      name: "Pengguna tertentu",
      subjectType: "REQUEST",
      steps: { create: [{ stepNumber: 1, name: "Approver tetap", approverType: "USER", approverUser: { connect: { id: org.users.requester.id } } }] },
    });
    const res = await newSubmittedRequest();
    expect(res.status).toBe("ON_HOLD");
    expect(res.holdReason).toMatch(/pemisahan tugas/);

    await db.approvalRuleStep.updateMany({ data: { approverUserId: org.users.supervisor.id } });
    const out = await rerouteRequest(await ctxOf(org.users.admin.id), res.id);
    expect(out.status).toBe("PENDING_APPROVAL");
  });

  it("approver nonaktif menahan pengajuan; tidak ada delegasi otomatis", async () => {
    await createRule({
      name: "Atasan",
      subjectType: "REQUEST",
      steps: { create: [{ stepNumber: 1, name: "Atasan", approverType: "REQUESTER_SUPERVISOR" }] },
    });
    await db.user.update({ where: { id: org.users.supervisor.id }, data: { accountStatus: "DISABLED" } });
    const res = await newSubmittedRequest();
    expect(res.status).toBe("ON_HOLD");
    expect(res.holdReason).toMatch(/tidak aktif/);
  });

  it("aturan ambigu (prioritas sama) ditahan", async () => {
    const steps = { create: [{ stepNumber: 1, name: "Atasan", approverType: "REQUESTER_SUPERVISOR" as const }] };
    await createRule({ name: "A", subjectType: "REQUEST", steps });
    await createRule({ name: "B", subjectType: "REQUEST", steps });
    const res = await newSubmittedRequest();
    expect(res.status).toBe("ON_HOLD");
    expect(res.holdReason).toMatch(/Lebih dari satu aturan/);
  });

  it("menarik pengajuan membatalkan proses dan mengembalikan ke draf", async () => {
    await createRule({
      name: "Atasan",
      subjectType: "REQUEST",
      steps: { create: [{ stepNumber: 1, name: "Atasan", approverType: "REQUESTER_SUPERVISOR" }] },
    });
    const res = await newSubmittedRequest();
    await withdrawRequest(res.ctx, res.id, "Salah ketik");
    const req = await db.request.findUniqueOrThrow({ where: { id: res.id } });
    expect(req.status).toBe("DRAFT");
    const a = await db.approvalAssignment.findFirstOrThrow({ where: { approverUserId: org.users.supervisor.id } });
    expect(a.status).toBe("CANCELLED");
  });

  it("pengiriman tanpa lampiran wajib ditolak", async () => {
    const ctx = await ctxOf(org.users.requester.id);
    const draft = await createDraft(ctx, {
      title: "Tanpa lampiran",
      generalReason: "Uji dokumen wajib saat pengiriman",
      neededDate: futureDate(),
      items: [{ itemName: "Kertas A4", specification: "80 gsm", quantity: "5", unitName: "rim", estimatedUnitPrice: "55000" }],
    });
    await expect(submitRequest(ctx, draft.id, { lockVersion: draft.lockVersion })).rejects.toThrow(/Dokumen wajib/);
  });

  it("kirim ulang dengan idempotency key yang sama tidak membuat versi ganda", async () => {
    await createRule({
      name: "Atasan",
      subjectType: "REQUEST",
      steps: { create: [{ stepNumber: 1, name: "Atasan", approverType: "REQUESTER_SUPERVISOR" }] },
    });
    const ctx = await ctxOf(org.users.requester.id);
    const draft = await createDraft(ctx, {
      title: "Uji idempotensi",
      generalReason: "Klik ganda pada tombol kirim",
      neededDate: futureDate(),
      items: [{ itemName: "Mouse", specification: "USB", quantity: "1", unitName: "buah", estimatedUnitPrice: "100000" }],
    });
    await attachDoc({ requestId: draft.id }, "REQUEST_ATTACHMENT", org.users.requester.id);
    const a = await submitRequest(ctx, draft.id, { lockVersion: draft.lockVersion, idempotencyKey: "k1" });
    const b = await submitRequest(ctx, draft.id, { lockVersion: draft.lockVersion, idempotencyKey: "k1" });
    expect(b).toEqual(a);
    expect(await db.requestVersion.count({ where: { requestId: draft.id } })).toBe(1);
  });
});
