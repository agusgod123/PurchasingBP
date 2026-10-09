import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createDraft, submitRequest } from "@/server/modules/requests/service";
import { decideAssignment } from "@/server/modules/approvals/decide";
import { createPurchaseOrder, markOrdered, markReady, addQuote, selectQuote } from "@/server/modules/purchasing/service";
import { decideCancellation, requestCancellation } from "@/server/modules/cancellation/service";
import { canViewDocument } from "@/server/modules/documents/service";
import { canViewRequestDetail } from "@/server/modules/requests/access";
import { login } from "@/server/modules/auth/service";
import { attachDoc, createOrg, createRule, ctxOf, futureDate, pendingAssignmentFor, resetDatabase } from "../support/fixtures";

type Org = Awaited<ReturnType<typeof createOrg>>;
let org: Org;

async function submitted() {
  const ctx = await ctxOf(org.users.requester.id);
  const draft = await createDraft(ctx, {
    title: "Proyektor ruang rapat",
    generalReason: "Proyektor lama rusak dan tidak dapat diperbaiki",
    neededDate: futureDate(),
    items: [{ itemName: "Proyektor", specification: "3500 lumen, HDMI", quantity: "1", unitName: "unit", estimatedUnitPrice: "6000000" }],
  });
  await attachDoc({ requestId: draft.id }, "REQUEST_ATTACHMENT", org.users.requester.id);
  await submitRequest(ctx, draft.id, { lockVersion: draft.lockVersion });
  return { id: draft.id, ctx };
}

async function approve(requestId: string) {
  const t = await pendingAssignmentFor(org.users.supervisor.id, requestId);
  await decideAssignment(await ctxOf(org.users.supervisor.id), t.id, { decision: "APPROVE" });
}

beforeEach(async () => {
  await resetDatabase();
  org = await createOrg();
  await createRule({
    name: "Atasan",
    subjectType: "REQUEST",
    steps: { create: [{ stepNumber: 1, name: "Atasan", approverType: "REQUESTER_SUPERVISOR" }] },
  });
});

describe("pembatalan", () => {
  it("pemohon membatalkan langsung saat menunggu persetujuan; data tetap tersimpan", async () => {
    const r = await submitted();
    await requestCancellation(r.ctx, r.id, "Sudah tidak diperlukan");
    const req = await db.request.findUniqueOrThrow({ where: { id: r.id } });
    expect(req.status).toBe("CANCELLED");
    expect(req.cancellationReason).toBe("Sudah tidak diperlukan");
    expect(await db.approvalAssignment.count({ where: { status: "PENDING" } })).toBe(0);
  });

  it("setelah disetujui: diusulkan lalu diputuskan purchasing", async () => {
    const r = await submitted();
    await approve(r.id);
    const res = await requestCancellation(r.ctx, r.id, "Anggaran dialihkan");
    expect(res.status).toBe("CANCELLATION_REQUESTED");
    const cr = await db.cancellationRequest.findFirstOrThrow({ where: { requestId: r.id } });
    await expect(decideCancellation(r.ctx, cr.id, true)).rejects.toThrow();
    await decideCancellation(await ctxOf(org.users.purchasing.id), cr.id, true, "OK");
    expect((await db.request.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("CANCELLED");
  });

  it("setelah dipesan ke vendor: melalui matriks pembatalan; baris PO dihentikan", async () => {
    await createRule({
      name: "Pembatalan",
      subjectType: "CANCELLATION",
      steps: { create: [{ stepNumber: 1, name: "Atasan", approverType: "REQUESTER_SUPERVISOR" }] },
    });
    const r = await submitted();
    await approve(r.id);
    const item = await db.requestItem.findFirstOrThrow({ where: { requestId: r.id } });
    const pCtx = await ctxOf(org.users.purchasing.id);
    const v = await db.vendor.create({ data: { code: "V1", name: "PT Teknologi" } });
    const po = await createPurchaseOrder(pCtx, { vendorId: v.id, lines: [{ requestItemId: item.id, quantity: "1" }] });
    const q = await addQuote(pCtx, po.id, { vendorId: v.id, quoteDate: futureDate(0), totalAmount: "6000000" });
    await attachDoc({ vendorQuoteId: q.id }, "VENDOR_QUOTE", org.users.purchasing.id);
    await selectQuote(pCtx, q.id);
    await markReady(pCtx, po.id);
    await attachDoc({ purchaseOrderId: po.id }, "ORDER_PROOF", org.users.purchasing.id);
    await markOrdered(pCtx, po.id, { expectedDeliveryDate: futureDate(5) });

    const res = await requestCancellation(r.ctx, r.id, "Ruang rapat dipindah");
    expect(res.viaApproval).toBe(true);
    await approve(r.id);
    expect((await db.request.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("CANCELLED");
    const line = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    expect(line.closedQuantity.toString()).toBe("1");
  });
});

describe("keamanan & akses", () => {
  it("semua tabel memiliki Row Level Security aktif", async () => {
    const rows = await db.$queryRaw<Array<{ relname: string }>>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("pegawai lain tidak dapat melihat detail/dokumen; atasan yang ditugaskan dapat", async () => {
    const r = await submitted();
    const doc = await db.document.findFirstOrThrow({ where: { requestId: r.id } });
    const other = await ctxOf(org.users.itStaff.id);
    const sup = await ctxOf(org.users.supervisor.id);
    const admin = await ctxOf(org.users.admin.id);
    const req = await db.request.findUniqueOrThrow({ where: { id: r.id } });
    expect(await canViewRequestDetail(db, other.user, req)).toBe(false);
    expect(await canViewDocument(db, other.user, doc.id)).toBe(false);
    expect(await canViewRequestDetail(db, sup.user, req)).toBe(true);
    expect(await canViewDocument(db, sup.user, doc.id)).toBe(true);
    // Admin memiliki arsip pusat (document.view_all) tetapi tidak otomatis dapat menyetujui.
    const task = await pendingAssignmentFor(org.users.supervisor.id, r.id);
    await expect(decideAssignment(admin, task.id, { decision: "APPROVE" })).rejects.toThrow(/ditugaskan/);
  });

  it("login: password salah dikunci setelah 5 kali; akun menunggu aktivasi ditolak", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await login("budi", "salah-sekali-1", { ip: `10.0.0.${i}` });
      expect(res.ok).toBe(false);
    }
    const locked = await login("budi", "Rahasia123", { ip: "10.0.0.99" });
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.message).toMatch(/terkunci/);

    await db.user.update({ where: { username: "dewi" }, data: { accountStatus: "PENDING_ACTIVATION" } });
    const pending = await login("dewi@contoh.id", "Rahasia123", { ip: "10.0.1.1" });
    expect(pending.ok).toBe(false);
    if (!pending.ok) expect(pending.message).toMatch(/aktivasi/);

    const ok = await login("SARI", "Rahasia123", { ip: "10.0.1.2" });
    expect(ok.ok).toBe(true);
    expect(await db.session.count()).toBe(1);
  });
});
