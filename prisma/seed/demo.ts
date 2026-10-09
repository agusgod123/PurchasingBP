/**
 * Data DEMO untuk mencoba aplikasi: `pnpm db:seed:demo`
 * JANGAN dijalankan di production. Semua akun demo memakai password: Demo12345
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../../src/server/db";
import { seedAdmin, seedBase } from "./base-data";
import { hashPassword } from "../../src/server/auth/password";
import { loadAuthUser } from "../../src/server/auth/user";
import { invalidateSettingsCache } from "../../src/server/settings";
import { storage } from "../../src/server/storage";
import type { ActorContext } from "../../src/server/context";
import type { DocumentType } from "../../src/generated/prisma/enums";
import { createDraft, submitRequest } from "../../src/server/modules/requests/service";
import { decideAssignment } from "../../src/server/modules/approvals/decide";
import { addQuote, createPurchaseOrder, markOrdered, markReady, selectQuote } from "../../src/server/modules/purchasing/service";
import { recordReceipt } from "../../src/server/modules/receiving/service";
import { confirmHandover, prepareHandover } from "../../src/server/modules/handover/service";

const PASSWORD = "Demo12345";

function minimalPdf(title: string): Buffer {
  const text = title.replace(/[()\\]/g, "");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${44 + text.length} >>\nstream\nBT /F1 18 Tf 72 760 Td (${text}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

async function attach(parent: Record<string, string>, type: DocumentType, userId: string, filename: string) {
  const data = minimalPdf(filename);
  const key = `demo/${randomUUID()}.pdf`;
  await storage().write(key, data, "application/pdf");
  await db.document.create({
    data: {
      storageKey: key,
      originalFilename: filename,
      mimeType: "application/pdf",
      sizeBytes: data.length,
      documentType: type,
      uploadStatus: "READY",
      uploadedById: userId,
      ...parent,
    },
  });
}

async function ctx(username: string): Promise<ActorContext> {
  const u = await db.user.findUniqueOrThrow({ where: { username } });
  return { user: (await loadAuthUser(db, u.id))!, ip: "127.0.0.1", userAgent: "seed-demo" };
}

function future(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Seed demo diblokir di production. Set ALLOW_DEMO_SEED=true jika benar-benar diperlukan (mis. lingkungan uji).");
  }
  if ((await db.request.count()) > 0) {
    console.log("Database sudah berisi transaksi; seed demo dilewati agar data tidak tercampur.");
    return;
  }
  await seedBase(db);
  invalidateSettingsCache();
  await db.systemSetting.update({ where: { key: "app.organization_name" }, data: { value: "Kantor Pusat (Demo)" } });

  // Bagian
  const depts = Object.fromEntries(
    await Promise.all(
      [
        ["UMUM", "Umum & GA"],
        ["OPS", "Operasional"],
        ["IT", "Teknologi Informasi"],
        ["KEU", "Keuangan"],
        ["PGD", "Pengadaan"],
        ["PIM", "Pimpinan"],
      ].map(async ([code, name]) => [code, await db.department.upsert({ where: { code }, update: {}, create: { code, name } })]),
    ),
  );

  const hash = await hashPassword(PASSWORD);
  const roles = Object.fromEntries((await db.role.findMany()).map((r) => [r.code, r.id]));
  async function person(username: string, fullName: string, dept: string, position: string, roleCodes: string[], supervisor?: string) {
    const supEmp = supervisor ? (await db.user.findUnique({ where: { username: supervisor } }))?.employeeId : null;
    const emp = await db.employee.create({
      data: {
        fullName,
        email: `${username}@demo.local`,
        departmentId: depts[dept].id,
        positionName: position,
        supervisorId: supEmp ?? null,
        employeeNumber: `EMP-${String(Math.floor(Math.random() * 90000) + 10000)}`,
        sourceSystem: "DEMO",
      },
    });
    return db.user.create({
      data: {
        username,
        email: `${username}@demo.local`,
        fullName,
        passwordHash: hash,
        accountStatus: "ACTIVE",
        activatedAt: new Date(),
        employeeId: emp.id,
        roles: { create: roleCodes.map((c) => ({ roleId: roles[c] })) },
      },
    });
  }

  const hendra = await person("hendra", "Hendra Wijaya", "PIM", "Kepala Kantor", ["LEADERSHIP", "SUPERVISOR"]);
  const sari = await person("sari", "Sari Rahmawati", "OPS", "Kepala Operasional", ["SUPERVISOR", "SECTION_MANAGER"], "hendra");
  const andi = await person("andi", "Andi Pratama", "IT", "Kepala TI", ["SUPERVISOR"], "hendra");
  await person("budi", "Budi Santoso", "OPS", "Staf Lapangan", ["EMPLOYEE"], "sari");
  await person("dewi", "Dewi Lestari", "IT", "Staf TI", ["EMPLOYEE"], "andi");
  await person("rina", "Rina Kusuma", "PGD", "Staf Purchasing", ["PURCHASING"], "hendra");
  await person("yusuf", "Yusuf Hidayat", "PGD", "Staf Purchasing", ["PURCHASING"], "hendra");
  await person("lina", "Lina Marlina", "KEU", "Staf Keuangan", ["FINANCE"], "hendra");
  await seedAdmin(db, { username: "admin", email: "admin@demo.local", password: PASSWORD, fullName: "Admin Sistem" }, { mustChangePassword: false });

  await db.department.update({ where: { id: depts.OPS.id }, data: { headUserId: sari.id } });
  await db.department.update({ where: { id: depts.IT.id }, data: { headUserId: andi.id } });
  await db.department.update({ where: { id: depts.PIM.id }, data: { headUserId: hendra.id } });
  await db.userDepartmentScope.create({ data: { userId: sari.id, departmentId: depts.OPS.id, accessLevel: "MANAGE" } });

  // Matriks persetujuan CONTOH (aktif untuk demo)
  await db.approvalRule.updateMany({ where: { isSample: true }, data: { isActive: false } });
  const financeRole = roles.FINANCE;
  const leaderRole = roles.LEADERSHIP;
  await db.approvalRule.create({
    data: {
      code: "DEMO-STANDAR",
      name: "Pengajuan s.d. Rp10 juta",
      description: "CONTOH untuk demo: atasan langsung; Keuangan bila melampaui anggaran.",
      subjectType: "REQUEST",
      maxAmount: 10_000_000,
      routingMode: "SEQUENTIAL",
      isSample: true,
      steps: {
        create: [
          { stepNumber: 1, name: "Atasan langsung", approverType: "REQUESTER_SUPERVISOR", dueHours: 48 },
          { stepNumber: 2, name: "Keuangan (lewat anggaran)", approverType: "ROLE", approverRoleId: financeRole, approvalMode: "ANY", condition: "OVER_BUDGET" },
        ],
      },
    },
  });
  await db.approvalRule.create({
    data: {
      code: "DEMO-MENENGAH",
      name: "Pengajuan Rp10–50 juta",
      description: "CONTOH untuk demo: atasan langsung → Keuangan (berjenjang).",
      subjectType: "REQUEST",
      minAmount: 10_000_000.01,
      maxAmount: 50_000_000,
      routingMode: "SEQUENTIAL",
      isSample: true,
      steps: {
        create: [
          { stepNumber: 1, name: "Atasan langsung", approverType: "REQUESTER_SUPERVISOR", dueHours: 48 },
          { stepNumber: 2, name: "Keuangan", approverType: "ROLE", approverRoleId: financeRole, approvalMode: "ANY", dueHours: 48 },
        ],
      },
    },
  });
  await db.approvalRule.create({
    data: {
      code: "DEMO-BESAR",
      name: "Pengajuan di atas Rp50 juta",
      description: "CONTOH untuk demo: atasan → Keuangan → Pimpinan.",
      subjectType: "REQUEST",
      minAmount: 50_000_000.01,
      routingMode: "SEQUENTIAL",
      isSample: true,
      steps: {
        create: [
          { stepNumber: 1, name: "Atasan langsung", approverType: "REQUESTER_SUPERVISOR" },
          { stepNumber: 2, name: "Keuangan", approverType: "ROLE", approverRoleId: financeRole, approvalMode: "ANY" },
          { stepNumber: 3, name: "Pimpinan", approverType: "ROLE", approverRoleId: leaderRole, approvalMode: "ANY" },
        ],
      },
    },
  });
  await db.approvalRule.updateMany({ where: { code: { in: ["CONTOH-PEMBATALAN", "CONTOH-MASALAH-BARANG"] } }, data: { isActive: true } });

  // Anggaran
  const year = new Date().getFullYear();
  for (const [code, amount] of [["OPS", 25_000_000], ["IT", 150_000_000], ["UMUM", 60_000_000], ["KEU", 20_000_000], ["PGD", 20_000_000], ["PIM", 50_000_000]] as const) {
    await db.departmentBudget.create({ data: { departmentId: depts[code].id, fiscalYear: year, amount } });
  }

  // Katalog & vendor
  const cats = Object.fromEntries((await db.itemCategory.findMany()).map((c) => [c.code, c.id]));
  const catalog: Array<[string, string, string, string, number, string]> = [
    ["IT-LAP-01", "Laptop kerja 14 inci", "Core i5/Ryzen 5, RAM 16GB, SSD 512GB", "unit", 14_500_000, "IT"],
    ["IT-MON-01", "Monitor 24 inci", "IPS Full HD, HDMI", "unit", 2_100_000, "IT"],
    ["IT-MOU-01", "Mouse nirkabel", "2.4GHz, baterai AA", "buah", 150_000, "IT"],
    ["IT-KEY-01", "Keyboard USB", "Layout US, kabel 1.5 m", "buah", 175_000, "IT"],
    ["IT-RTR-01", "Router Wi-Fi", "Dual band AC1200", "unit", 850_000, "IT"],
    ["OPS-KRT-01", "Kertas A4 80 gsm", "1 rim = 500 lembar", "rim", 55_000, "OPS"],
    ["OPS-TNR-01", "Toner printer laser", "Kompatibel seri kantor", "buah", 650_000, "OPS"],
    ["OPS-MAP-01", "Map ordner", "Ukuran folio, punggung 7 cm", "buah", 32_000, "OPS"],
    ["EQP-HLM-01", "Helm safety", "Standar SNI, warna putih", "buah", 85_000, "EQP"],
    ["EQP-SRT-01", "Sarung tangan kerja", "Bahan katun berlapis karet", "pasang", 18_000, "EQP"],
    ["EQP-KRS-01", "Kursi kerja ergonomis", "Sandaran jaring, roda", "unit", 1_350_000, "EQP"],
    ["EQP-MJA-01", "Meja kerja", "120 x 60 cm, rangka besi", "unit", 1_200_000, "EQP"],
    ["EQP-PRY-01", "Proyektor", "3.500 lumen, HDMI", "unit", 6_200_000, "EQP"],
  ];
  for (const [code, name, description, unitName, price, cat] of catalog) {
    await db.catalogItem.create({ data: { code, name, description, unitName, defaultEstimatedPrice: price, categoryId: cats[cat] } });
  }
  const vendors = await Promise.all(
    [
      ["V-001", "PT Teknologi Nusantara", "Agus", "0811-111-222"],
      ["V-002", "CV Sumber Makmur", "Siti", "0812-333-444"],
      ["V-003", "Toko Alat Kantor Jaya", "Rudi", "0813-555-666"],
      ["V-004", "PT Safety Prima", "Joko", "0814-777-888"],
    ].map(([code, name, contactPerson, phone]) => db.vendor.create({ data: { code, name, contactPerson, phone, email: `${code.toLowerCase()}@vendor.demo` } })),
  );

  // Transaksi contoh melalui service (alur yang sama seperti di aplikasi)
  const budi = await ctx("budi");
  const dewi = await ctx("dewi");
  const rina = await ctx("rina");

  async function submit(c: ActorContext, title: string, reason: string, items: Array<[string, string, string, string, string]>, priority: "NORMAL" | "HIGH" | "URGENT" = "NORMAL") {
    const draft = await createDraft(c, {
      title,
      generalReason: reason,
      requestedPriority: priority,
      neededDate: future(14),
      items: items.map(([itemName, specification, quantity, unitName, estimatedUnitPrice]) => ({ itemName, specification, quantity, unitName, estimatedUnitPrice })),
    });
    await attach({ requestId: draft.id }, "REQUEST_ATTACHMENT", c.user.id, "memo-kebutuhan.pdf");
    await submitRequest(c, draft.id, { lockVersion: draft.lockVersion });
    return draft.id;
  }
  async function approveAll(requestId: string) {
    for (let guard = 0; guard < 5; guard++) {
      const pending = await db.approvalAssignment.findFirst({ where: { status: "PENDING", step: { instance: { requestId } } } });
      if (!pending) return;
      const u = await db.user.findUniqueOrThrow({ where: { id: pending.approverUserId } });
      await decideAssignment(await ctx(u.username), pending.id, { decision: "APPROVE", comment: "Disetujui." });
    }
  }

  // 1) Selesai penuh
  const r1 = await submit(budi, "APD untuk tim lapangan", "Helm dan sarung tangan tim lapangan sudah rusak dan tidak layak pakai.", [
    ["Helm safety", "Standar SNI, warna putih", "6", "buah", "85000"],
    ["Sarung tangan kerja", "Bahan katun berlapis karet", "12", "pasang", "18000"],
  ], "HIGH");
  await approveAll(r1);
  const r1Items = await db.requestItem.findMany({ where: { requestId: r1 }, orderBy: { lineNo: "asc" } });
  const po1 = await createPurchaseOrder(rina, { vendorId: vendors[3].id, title: "APD tim lapangan", lines: r1Items.map((i) => ({ requestItemId: i.id, quantity: i.quantity.toString() })) });
  const q1 = await addQuote(rina, po1.id, { vendorId: vendors[3].id, quoteDate: future(-3), totalAmount: "726000", quoteNumber: "SP-0921" });
  await attach({ vendorQuoteId: q1.id }, "VENDOR_QUOTE", rina.user.id, "penawaran-safety-prima.pdf");
  await selectQuote(rina, q1.id, "Harga sesuai estimasi, stok tersedia");
  await markReady(rina, po1.id);
  await attach({ purchaseOrderId: po1.id }, "ORDER_PROOF", rina.user.id, "bukti-pesanan.pdf");
  await markOrdered(rina, po1.id, { expectedDeliveryDate: future(3), vendorReference: "SO-77812" });
  const po1Lines = await db.purchaseOrderItem.findMany({ where: { purchaseOrderId: po1.id } });
  await recordReceipt(rina, po1.id, { deliveryNoteNumber: "SJ-5521", lines: po1Lines.map((l) => ({ purchaseOrderItemId: l.id, quantityReceived: l.quantityOrdered.toString() })) });
  const h1 = await prepareHandover(rina, r1, { location: "Gudang lantai 1" });
  await confirmHandover(budi, h1.id, { items: [] });

  // 2) Laptop: harga aktual naik → menunggu persetujuan perubahan
  const r2 = await submit(dewi, "Laptop pengganti staf TI", "Laptop lama berumur 6 tahun, sering mati dan menghambat pekerjaan.", [
    ["Laptop kerja 14 inci", "Core i5/Ryzen 5, RAM 16GB, SSD 512GB", "2", "unit", "14500000"],
  ], "HIGH");
  await approveAll(r2);
  const r2Item = await db.requestItem.findFirstOrThrow({ where: { requestId: r2 } });
  const po2 = await createPurchaseOrder(rina, { vendorId: vendors[0].id, title: "Laptop TI", lines: [{ requestItemId: r2Item.id, quantity: "2", unitPrice: "15250000" }] });
  const q2 = await addQuote(rina, po2.id, { vendorId: vendors[0].id, quoteDate: future(-1), totalAmount: "30500000", quoteNumber: "TN-1180" });
  await attach({ vendorQuoteId: q2.id }, "VENDOR_QUOTE", rina.user.id, "penawaran-teknologi-nusantara.pdf");
  await selectQuote(rina, q2.id);
  await markReady(rina, po2.id, "Harga distributor naik 5% sejak estimasi dibuat");

  // 3) Kertas & toner: disetujui, di antrean purchasing
  const r3 = await submit(budi, "ATK bulan depan", "Stok kertas dan toner untuk kebutuhan administrasi bulan depan.", [
    ["Kertas A4 80 gsm", "1 rim = 500 lembar", "20", "rim", "55000"],
    ["Toner printer laser", "Kompatibel seri kantor", "2", "buah", "650000"],
  ]);
  await approveAll(r3);

  // 4) Menunggu persetujuan atasan
  await submit(budi, "Kursi kerja ruang operasional", "Dua kursi patah dan tidak aman digunakan.", [["Kursi kerja ergonomis", "Sandaran jaring, roda", "2", "unit", "1350000"]], "URGENT");

  // 5) Draf
  await createDraft(dewi, {
    title: "Monitor tambahan",
    generalReason: "",
    neededDate: future(30),
    items: [{ itemName: "Monitor 24 inci", specification: "IPS Full HD, HDMI", quantity: "1", unitName: "unit", estimatedUnitPrice: "2100000" }],
  });

  console.log("✓ Data demo siap. Akun: admin, budi, dewi, sari, andi, rina, yusuf, lina, hendra — password: " + PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
