import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createDraft, submitRequest, itemFulfilment } from "@/server/modules/requests/service";
import { decideAssignment } from "@/server/modules/approvals/decide";
import {
  addQuote,
  closePurchaseOrder,
  createPurchaseOrder,
  markOrdered,
  markReady,
  selectQuote,
  addFollowup,
} from "@/server/modules/purchasing/service";
import { proposeResolution, recordReceipt, reportShortage } from "@/server/modules/receiving/service";
import { confirmHandover, prepareHandover } from "@/server/modules/handover/service";
import { attachDoc, createOrg, createRule, ctxOf, futureDate, pendingAssignmentFor, resetDatabase } from "../support/fixtures";

type Org = Awaited<ReturnType<typeof createOrg>>;
let org: Org;

async function approvedRequest(userId: string, item: { itemName: string; quantity: string; price: string; unit?: string }) {
  const ctx = await ctxOf(userId);
  const draft = await createDraft(ctx, {
    title: `Kebutuhan ${item.itemName}`,
    generalReason: "Kebutuhan operasional rutin bagian",
    neededDate: futureDate(),
    items: [{ itemName: item.itemName, specification: "Standar kantor", quantity: item.quantity, unitName: item.unit ?? "buah", estimatedUnitPrice: item.price }],
  });
  await attachDoc({ requestId: draft.id }, "REQUEST_ATTACHMENT", userId);
  await submitRequest(ctx, draft.id, { lockVersion: draft.lockVersion });
  const task = await pendingAssignmentFor(org.users.supervisor.id, draft.id);
  await decideAssignment(await ctxOf(org.users.supervisor.id), task.id, { decision: "APPROVE" });
  const req = await db.request.findUniqueOrThrow({ where: { id: draft.id }, include: { items: true } });
  expect(req.status).toBe("APPROVED");
  return req;
}

async function vendor() {
  return db.vendor.create({ data: { code: `V${Date.now()}`, name: "CV Sumber Makmur" } });
}

beforeEach(async () => {
  await resetDatabase();
  org = await createOrg();
  await createRule({
    name: "Atasan",
    subjectType: "REQUEST",
    steps: { create: [{ stepNumber: 1, name: "Atasan", approverType: "REQUESTER_SUPERVISOR" }] },
  });
  await createRule({
    name: "Masalah barang",
    subjectType: "DISCREPANCY_RESOLUTION",
    steps: { create: [{ stepNumber: 1, name: "Atasan pemohon", approverType: "REQUESTER_SUPERVISOR" }] },
  });
});

describe("alur pengadaan lengkap", () => {
  it("gabung 2 pengajuan → perubahan harga → pesan → terima parsial & rusak → pengganti → serah terima → tutup", async () => {
    const helmReq = await approvedRequest(org.users.requester.id, { itemName: "Helm safety", quantity: "10", price: "150000" });
    const kertasReq = await approvedRequest(org.users.itStaff.id, { itemName: "Kertas A4", quantity: "20", price: "50000", unit: "rim" });
    const pCtx = await ctxOf(org.users.purchasing.id);
    const v = await vendor();

    // 1. PO gabungan; harga kertas aktual lebih tinggi dari estimasi.
    const po = await createPurchaseOrder(pCtx, {
      vendorId: v.id,
      lines: [
        { requestItemId: helmReq.items[0].id, quantity: "10", unitPrice: "150000" },
        { requestItemId: kertasReq.items[0].id, quantity: "20", unitPrice: "55000" },
      ],
    });
    expect(po.poNumber).toMatch(/^PO-\d{4}-00001$/);
    expect((await db.request.findUniqueOrThrow({ where: { id: helmReq.id } })).status).toBe("IN_PROCUREMENT");
    expect(await db.purchaseOrderRequest.count({ where: { purchaseOrderId: po.id } })).toBe(2);

    // 2. Penawaran
    const quote = await addQuote(pCtx, po.id, { vendorId: v.id, quoteDate: futureDate(0), totalAmount: "2600000" });
    await attachDoc({ vendorQuoteId: quote.id }, "VENDOR_QUOTE", org.users.purchasing.id);
    await selectQuote(pCtx, quote.id, "Harga terbaik");

    // 3. Siap dipesan → perubahan harga butuh persetujuan pemohon + atasan (bawaan).
    await expect(markReady(pCtx, po.id)).rejects.toThrow(/alasan/i);
    const ready = await markReady(pCtx, po.id, "Harga kertas naik dari distributor");
    expect(ready.status).toBe("PENDING_CHANGE_APPROVAL");
    expect(ready.changeRequests).toBe(1);
    const cr = await db.changeRequest.findFirstOrThrow({ where: { purchaseOrderId: po.id }, include: { items: true } });
    expect(cr.requestId).toBe(kertasReq.id);
    expect(cr.items[0].changeType).toBe("PRICE");

    const reqTask = await pendingAssignmentFor(org.users.itStaff.id, kertasReq.id);
    await decideAssignment(await ctxOf(org.users.itStaff.id), reqTask.id, { decision: "APPROVE" });
    const supTask = await pendingAssignmentFor(org.users.supervisor.id, kertasReq.id);
    await decideAssignment(await ctxOf(org.users.supervisor.id), supTask.id, { decision: "APPROVE" });
    expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("READY_TO_ORDER");

    // 4. Pesan: bukti pemesanan wajib.
    await expect(markOrdered(pCtx, po.id, { expectedDeliveryDate: futureDate(7) })).rejects.toThrow(/Bukti pemesanan/);
    await attachDoc({ purchaseOrderId: po.id }, "ORDER_PROOF", org.users.purchasing.id);
    await markOrdered(pCtx, po.id, { expectedDeliveryDate: futureDate(7) });

    // Keterlambatan wajib mencatat data lengkap.
    await expect(addFollowup(pCtx, po.id, { followupType: "DELAY", actionTaken: "Telepon vendor", actionDate: futureDate(0) })).rejects.toThrow(
      /keterlambatan/,
    );
    await addFollowup(pCtx, po.id, {
      followupType: "DELAY",
      reason: "Stok vendor kosong",
      newEta: futureDate(10),
      actionTaken: "Telepon vendor",
      actionDate: futureDate(0),
      vendorResponse: "Dikirim minggu depan",
      targetResolutionDate: futureDate(10),
    });
    expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).currentEta?.toISOString().slice(0, 10)).toBe(futureDate(10));

    // 5. Penerimaan parsial + barang rusak → seluruh PO ditahan.
    const lines = await db.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id }, orderBy: { lineNo: "asc" } });
    const r1 = await recordReceipt(pCtx, po.id, {
      lines: [
        { purchaseOrderItemId: lines[0].id, quantityReceived: "6" },
        { purchaseOrderItemId: lines[1].id, quantityReceived: "20", quantityRejected: "5", condition: "DAMAGED", notes: "Basah" },
      ],
    });
    expect(r1.poStatus).toBe("ON_HOLD");
    await expect(
      recordReceipt(pCtx, po.id, { lines: [{ purchaseOrderItemId: lines[0].id, quantityReceived: "5" }] }),
    ).rejects.toThrow(/melebihi sisa/);

    // 6. Usulan penggantian → disetujui atasan pemohon → PO pengganti dibuat.
    const disc = await db.receiptDiscrepancy.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    await proposeResolution(pCtx, disc.id, { resolutionType: "REPLACEMENT", note: "Vendor mengganti 5 rim" });
    const dTask = await pendingAssignmentFor(org.users.supervisor.id, kertasReq.id);
    await decideAssignment(await ctxOf(org.users.supervisor.id), dTask.id, { decision: "APPROVE" });
    const replacement = await db.purchaseOrder.findFirstOrThrow({ where: { replacesPurchaseOrderId: po.id } });
    expect(replacement.status).toBe("DRAFT");
    expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("PARTIALLY_RECEIVED");

    // 7. Sisa helm diterima → PO asal lengkap; pengajuan helm siap serah terima.
    await recordReceipt(pCtx, po.id, { lines: [{ purchaseOrderItemId: lines[0].id, quantityReceived: "4" }] });
    expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("RECEIVED");
    expect((await db.request.findUniqueOrThrow({ where: { id: helmReq.id } })).status).toBe("READY_FOR_HANDOVER");
    expect((await db.request.findUniqueOrThrow({ where: { id: kertasReq.id } })).status).toBe("IN_PROCUREMENT");

    // 8. PO pengganti: harga sudah disetujui → tidak perlu persetujuan ulang; tidak perlu penawaran baru.
    const rReady = await markReady(pCtx, replacement.id);
    expect(rReady.status).toBe("READY_TO_ORDER");
    await attachDoc({ purchaseOrderId: replacement.id }, "ORDER_PROOF", org.users.purchasing.id);
    await markOrdered(pCtx, replacement.id, { expectedDeliveryDate: futureDate(5) });
    const rLine = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: replacement.id } });
    await recordReceipt(pCtx, replacement.id, { lines: [{ purchaseOrderItemId: rLine.id, quantityReceived: "5" }] });
    expect((await db.request.findUniqueOrThrow({ where: { id: kertasReq.id } })).status).toBe("READY_FOR_HANDOVER");

    // 9. Serah terima helm.
    const h1 = await prepareHandover(pCtx, helmReq.id, { location: "Gudang lantai 1" });
    expect((await db.request.findUniqueOrThrow({ where: { id: helmReq.id } })).status).toBe("AWAITING_CONFIRMATION");
    await expect(confirmHandover(pCtx, h1.id, { items: [] })).rejects.toThrow(/pemohon/);
    await confirmHandover(await ctxOf(org.users.requester.id), h1.id, { items: [] });
    expect((await db.request.findUniqueOrThrow({ where: { id: helmReq.id } })).status).toBe("COMPLETED");

    // 10. Serah terima kertas: pemohon melaporkan selisih → kembali ke purchasing → serah ulang.
    const h2 = await prepareHandover(pCtx, kertasReq.id, {});
    const h2Item = await db.handoverItem.findFirstOrThrow({ where: { handoverId: h2.id } });
    const dewi = await ctxOf(org.users.itStaff.id);
    await expect(confirmHandover(dewi, h2.id, { items: [{ handoverItemId: h2Item.id, confirmedQuantity: "19" }] })).rejects.toThrow(/selisih/);
    const disputed = await confirmHandover(dewi, h2.id, { items: [{ handoverItemId: h2Item.id, confirmedQuantity: "19" }], note: "Kurang 1 rim" });
    expect(disputed.status).toBe("DISPUTED");
    expect((await db.request.findUniqueOrThrow({ where: { id: kertasReq.id } })).status).toBe("READY_FOR_HANDOVER");
    const h3 = await prepareHandover(pCtx, kertasReq.id, { notes: "1 rim ditemukan di gudang" });
    await confirmHandover(dewi, h3.id, { items: [] });
    expect((await db.request.findUniqueOrThrow({ where: { id: kertasReq.id } })).status).toBe("COMPLETED");

    // 11. Tutup PO.
    await closePurchaseOrder(pCtx, po.id);
    await closePurchaseOrder(pCtx, replacement.id);
    expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("CLOSED");

    // Riwayat lengkap tercatat.
    expect(await db.purchaseOrderStatusHistory.count({ where: { purchaseOrderId: po.id } })).toBeGreaterThanOrEqual(6);
    expect(await db.auditLog.count({ where: { action: "receipt.create" } })).toBe(3);
  });

  it("serah terima tidak dapat disiapkan sebelum pesanan lengkap", async () => {
    const req = await approvedRequest(org.users.requester.id, { itemName: "Sarung tangan", quantity: "10", price: "20000" });
    const pCtx = await ctxOf(org.users.purchasing.id);
    const v = await vendor();
    const po = await createPurchaseOrder(pCtx, { vendorId: v.id, lines: [{ requestItemId: req.items[0].id, quantity: "10" }] });
    const quote = await addQuote(pCtx, po.id, { vendorId: v.id, quoteDate: futureDate(0), totalAmount: "200000" });
    await attachDoc({ vendorQuoteId: quote.id }, "VENDOR_QUOTE", org.users.purchasing.id);
    await selectQuote(pCtx, quote.id);
    expect((await markReady(pCtx, po.id)).status).toBe("READY_TO_ORDER");
    await attachDoc({ purchaseOrderId: po.id }, "ORDER_PROOF", org.users.purchasing.id);
    await markOrdered(pCtx, po.id, { expectedDeliveryDate: futureDate(3) });
    const line = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    await recordReceipt(pCtx, po.id, { lines: [{ purchaseOrderItemId: line.id, quantityReceived: "7" }] });
    await expect(prepareHandover(pCtx, req.id, {})).rejects.toThrow(/setelah seluruh barang diterima/);

    // Vendor tidak sanggup memenuhi sisa → kekurangan diterima resmi → kebutuhan dikurangi.
    await reportShortage(pCtx, po.id, line.id, "3", "Vendor hanya punya 7");
    const disc = await db.receiptDiscrepancy.findFirstOrThrow({ where: { purchaseOrderId: po.id, type: "SHORTAGE" } });
    await proposeResolution(pCtx, disc.id, { resolutionType: "ACCEPT_SHORTAGE", note: "Disetujui pemohon cukup 7" });
    const t = await pendingAssignmentFor(org.users.supervisor.id, req.id);
    await decideAssignment(await ctxOf(org.users.supervisor.id), t.id, { decision: "APPROVE" });
    const f = await db.$transaction((tx) => itemFulfilment(tx, req.id));
    expect(f[0].required.toString()).toBe("7");
    expect((await db.request.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("READY_FOR_HANDOVER");
    expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("RECEIVED");
  });

  it("menolak perubahan harga mengembalikan PO ke draf", async () => {
    const req = await approvedRequest(org.users.requester.id, { itemName: "Kursi kerja", quantity: "2", price: "1000000" });
    const pCtx = await ctxOf(org.users.purchasing.id);
    const v = await vendor();
    const po = await createPurchaseOrder(pCtx, { vendorId: v.id, lines: [{ requestItemId: req.items[0].id, quantity: "2", unitPrice: "1200000" }] });
    await markReady(pCtx, po.id, "Harga naik");
    const t = await pendingAssignmentFor(org.users.requester.id, req.id);
    await decideAssignment(await ctxOf(org.users.requester.id), t.id, { decision: "REJECT", comment: "Terlalu mahal, cari vendor lain" });
    const updated = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    expect(updated.status).toBe("DRAFT");
    expect(updated.holdReason).toMatch(/Terlalu mahal/);
    // Atasan tidak lagi punya tugas yang menggantung.
    expect(await db.approvalAssignment.count({ where: { approverUserId: org.users.supervisor.id, status: "PENDING" } })).toBe(0);
  });
});
