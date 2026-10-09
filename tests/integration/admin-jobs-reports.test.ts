import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createDraft, submitRequest } from "@/server/modules/requests/service";
import { approvalEscalations, approvalReminders, cleanup } from "@/server/jobs/maintenance";
import { importEmployees, parseCsv } from "@/server/modules/admin/org";
import { createUser, setAccountStatus, setUserRoles } from "@/server/modules/admin/users";
import { saveApprovalRule } from "@/server/modules/admin/rules";
import { runReport } from "@/server/reports/definitions";
import { parseReportFilters } from "@/server/reports/filters";
import { verifyPassword } from "@/server/auth/password";
import { attachDoc, createOrg, createRule, ctxOf, futureDate, resetDatabase } from "../support/fixtures";

type Org = Awaited<ReturnType<typeof createOrg>>;
let org: Org;

beforeEach(async () => {
  await resetDatabase();
  org = await createOrg();
});

async function submitted() {
  await createRule({
    name: "Standar",
    subjectType: "REQUEST",
    routingMode: "SEQUENTIAL",
    steps: { create: [{ stepNumber: 1, name: "Atasan", approverType: "REQUESTER_SUPERVISOR", approvalMode: "ALL" }] },
  });
  const ctx = await ctxOf(org.users.requester.id);
  const draft = await createDraft(ctx, {
    title: "Kertas kantor",
    generalReason: "Stok habis untuk bulan depan",
    neededDate: futureDate(),
    items: [{ itemName: "Kertas A4", specification: "80 gsm", quantity: "5", unitName: "rim", estimatedUnitPrice: "55000" }],
  });
  await attachDoc({ requestId: draft.id }, "REQUEST_ATTACHMENT", org.users.requester.id);
  await submitRequest(ctx, draft.id, { lockVersion: draft.lockVersion });
  return draft.id;
}

describe("tugas terjadwal", () => {
  it("mengirim pengingat sekali per interval dan eskalasi ke atasan approver", async () => {
    const requestId = await submitted();
    const a = await db.approvalAssignment.findFirstOrThrow({ where: { status: "PENDING", step: { instance: { requestId } } } });
    expect(a.dueAt).not.toBeNull();
    // Mundurkan tenggat 100 jam agar lewat batas pengingat dan eskalasi (72 jam).
    await db.approvalAssignment.update({ where: { id: a.id }, data: { dueAt: new Date(Date.now() - 100 * 3_600_000) } });

    expect((await approvalReminders()).reminders).toBe(1);
    expect((await approvalReminders()).reminders).toBe(0); // masih dalam interval
    const esc = await approvalEscalations();
    expect(esc.escalations).toBe(1);
    expect((await approvalEscalations()).escalations).toBe(0);

    const notes = await db.notification.findMany({ where: { type: "APPROVAL_ESCALATION" } });
    // Atasan approver (pimpinan) + admin (approval.reassign)
    expect(notes.map((n) => n.recipientId).sort()).toEqual([org.users.leader.id, org.users.admin.id].sort());
    // Tidak ada keputusan otomatis.
    expect((await db.approvalAssignment.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("PENDING");
  });

  it("membersihkan sesi kedaluwarsa tanpa menyentuh audit log", async () => {
    await db.session.create({ data: { id: "x".repeat(64), userId: org.users.requester.id, expiresAt: new Date(Date.now() - 1000) } });
    const before = await db.auditLog.count();
    const res = await cleanup();
    expect(res.sessions).toBe(1);
    expect(await db.auditLog.count()).toBe(before);
  });
});

describe("administrasi", () => {
  it("impor CSV pegawai: pratinjau tidak menulis, lalu impor dengan relasi atasan", async () => {
    const ctx = await ctxOf(org.users.admin.id);
    const csv = "nomor_pegawai;nama;email;kode_bagian;jabatan;nomor_atasan\nE-2;Staf Baru;staf@contoh.id;OPS;Staf;E-1\nE-1;Kepala Baru;kepala@contoh.id;OPS;Kepala;\n";
    expect(parseCsv(csv)[1]).toEqual(["E-2", "Staf Baru", "staf@contoh.id", "OPS", "Staf", "E-1"]);
    const preview = await importEmployees(ctx, csv, false);
    expect(preview).toMatchObject({ created: 2, updated: 0, errors: 0, committed: false });
    expect(await db.employee.count({ where: { employeeNumber: { in: ["E-1", "E-2"] } } })).toBe(0);
    await importEmployees(ctx, csv, true);
    const staff = await db.employee.findUniqueOrThrow({ where: { employeeNumber: "E-2" }, include: { supervisor: true } });
    expect(staff.supervisor?.employeeNumber).toBe("E-1");

    const bad = await importEmployees(ctx, "nomor_pegawai,nama,kode_bagian\nE-3,Siapa,XXX\n", false);
    expect(bad.errors).toBe(1);
    await expect(importEmployees(ctx, "nomor_pegawai,nama,kode_bagian\nE-3,Siapa,XXX\n", true)).rejects.toThrow(/Perbaiki/);
  });

  it("membuat akun dengan password sementara dan mencegah admin mengunci diri", async () => {
    const ctx = await ctxOf(org.users.admin.id);
    const res = await createUser(ctx, { username: "baru", email: "baru@contoh.id", fullName: "Pengguna Baru", employeeId: null, roleIds: [] });
    const u = await db.user.findUniqueOrThrow({ where: { id: res.id } });
    expect(u.mustChangePassword).toBe(true);
    expect(await verifyPassword(u.passwordHash, res.temporaryPassword)).toBe(true);

    await expect(setUserRoles(ctx, org.users.admin.id, [])).rejects.toThrow(/akun sendiri/);
    await expect(setAccountStatus(ctx, org.users.admin.id, "DISABLED", "uji")).rejects.toThrow(/akun sendiri/);
    await expect(setAccountStatus(await ctxOf(org.users.requester.id), u.id, "DISABLED", "x")).rejects.toThrow();
  });

  it("memperingatkan aturan beririsan dengan prioritas sama", async () => {
    const ctx = await ctxOf(org.users.admin.id);
    const base = {
      description: null,
      subjectType: "REQUEST" as const,
      requestType: null,
      departmentId: null,
      priority: 0,
      routingMode: "SEQUENTIAL" as const,
      isActive: true,
      effectiveFrom: null,
      effectiveUntil: null,
      steps: [{ name: "Atasan", approverType: "REQUESTER_SUPERVISOR" as const, approverUserId: null, approverRoleId: null, roleScope: "ANY_DEPARTMENT" as const, approvalMode: "ALL" as const, condition: "ALWAYS" as const, dueHours: null }],
    };
    const a = await saveApprovalRule(ctx, null, { ...base, code: "R-A", name: "Kecil", minAmount: null, maxAmount: "10000000" });
    expect(a.warnings).toHaveLength(0);
    const b = await saveApprovalRule(ctx, null, { ...base, code: "R-B", name: "Sedang", minAmount: "5000000", maxAmount: "50000000" });
    expect(b.warnings[0]).toMatch(/Beririsan dengan "Kecil"/);
    const c = await saveApprovalRule(ctx, null, { ...base, code: "R-C", name: "Besar", minAmount: "50000001", maxAmount: null });
    expect(c.warnings).toHaveLength(0);
  });
});

describe("laporan", () => {
  it("menghormati cakupan bagian dan menolak pengguna tanpa izin", async () => {
    await submitted();
    const f = parseReportFilters({});
    const all = await runReport(await ctxOf(org.users.leader.id).then((c) => c.user), "riwayat", f);
    expect(all.rows).toHaveLength(1);

    // Supervisor OPS hanya melihat bagiannya; filter ke bagian IT menghasilkan kosong.
    const sup = (await ctxOf(org.users.supervisor.id)).user;
    expect((await runReport(sup, "riwayat", f)).rows).toHaveLength(1);
    expect((await runReport(sup, "riwayat", { ...f, departmentId: org.departments.it.id })).rows).toHaveLength(0);

    await expect(runReport((await ctxOf(org.users.requester.id)).user, "status", f)).rejects.toThrow(/akses laporan/);
  });
});
