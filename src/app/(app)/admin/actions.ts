"use server";

import type { AccountStatus, ScopeAccessLevel } from "@/generated/prisma/enums";
import { getActor } from "@/server/auth/current";
import { runAction } from "@/server/action";
import type { Settings } from "@/server/settings-defaults";
import * as users from "@/server/modules/admin/users";
import * as org from "@/server/modules/admin/org";
import * as roles from "@/server/modules/admin/roles";
import * as rules from "@/server/modules/admin/rules";
import * as config from "@/server/modules/admin/config";
import { rerouteRequest } from "@/server/modules/requests/service";

type In<F extends (...a: never[]) => unknown, I extends number> = Parameters<F>[I];

// --- Pengguna -------------------------------------------------------------------
export async function createUserAction(input: In<typeof users.createUser, 1>) {
  return runAction(async () => users.createUser(await getActor(), input), "Akun dibuat.");
}
export async function setAccountStatusAction(userId: string, status: AccountStatus, reason?: string | null) {
  return runAction(async () => users.setAccountStatus(await getActor(), userId, status, reason), "Status akun diperbarui.");
}
export async function updateUserProfileAction(userId: string, input: In<typeof users.updateUserProfile, 2>) {
  return runAction(async () => users.updateUserProfile(await getActor(), userId, input), "Data akun disimpan.");
}
export async function setUserRolesAction(userId: string, roleIds: string[]) {
  return runAction(async () => users.setUserRoles(await getActor(), userId, roleIds), "Peran diperbarui.");
}
export async function setUserScopesAction(userId: string, scopes: Array<{ departmentId: string; accessLevel: ScopeAccessLevel }>) {
  return runAction(async () => users.setUserScopes(await getActor(), userId, scopes), "Cakupan bagian diperbarui.");
}
export async function resetPasswordAction(userId: string) {
  return runAction(async () => users.adminResetPassword(await getActor(), userId));
}
export async function revokeSessionsAction(userId: string) {
  return runAction(async () => users.revokeUserSessions(await getActor(), userId), "Semua sesi akun dikeluarkan.");
}

// --- Organisasi -----------------------------------------------------------------
export async function saveDepartmentAction(id: string | null, input: In<typeof org.saveDepartment, 2>) {
  return runAction(async () => org.saveDepartment(await getActor(), id, input), "Bagian disimpan.");
}
export async function saveEmployeeAction(id: string | null, input: In<typeof org.saveEmployee, 2>) {
  return runAction(async () => org.saveEmployee(await getActor(), id, input), "Data pegawai disimpan.");
}
export async function importEmployeesAction(csv: string, commit: boolean) {
  return runAction(async () => org.importEmployees(await getActor(), csv, commit), commit ? "Impor selesai." : undefined);
}

// --- Peran ----------------------------------------------------------------------
export async function saveRoleAction(id: string | null, input: In<typeof roles.saveRole, 2>) {
  return runAction(async () => roles.saveRole(await getActor(), id, input), "Peran disimpan.");
}
export async function setRolePermissionsAction(roleId: string, codes: string[]) {
  return runAction(async () => roles.setRolePermissions(await getActor(), roleId, codes), "Izin peran disimpan.");
}
export async function deleteRoleAction(roleId: string) {
  return runAction(async () => roles.deleteRole(await getActor(), roleId), "Peran dihapus.");
}

// --- Matriks persetujuan --------------------------------------------------------
export async function saveRuleAction(id: string | null, input: rules.RuleInput) {
  return runAction(async () => rules.saveApprovalRule(await getActor(), id, input), "Aturan disimpan.");
}
export async function setRuleActiveAction(id: string, isActive: boolean) {
  return runAction(async () => rules.setRuleActive(await getActor(), id, isActive), isActive ? "Aturan diaktifkan." : "Aturan dinonaktifkan.");
}
export async function deleteRuleAction(id: string) {
  return runAction(async () => rules.deleteApprovalRule(await getActor(), id), "Aturan dihapus.");
}
export async function rerouteRequestAction(requestId: string) {
  return runAction(async () => rerouteRequest(await getActor(), requestId), "Jalur persetujuan diproses ulang.");
}

// --- Konfigurasi ----------------------------------------------------------------
export async function saveDocRequirementAction(id: string | null, input: In<typeof config.saveDocumentRequirement, 2>) {
  return runAction(async () => config.saveDocumentRequirement(await getActor(), id, input), "Ketentuan dokumen disimpan.");
}
export async function deleteDocRequirementAction(id: string) {
  return runAction(async () => config.deleteDocumentRequirement(await getActor(), id), "Ketentuan dokumen dihapus.");
}
export async function saveCategoryAction(id: string | null, input: In<typeof config.saveCategory, 2>) {
  return runAction(async () => config.saveCategory(await getActor(), id, input), "Kategori disimpan.");
}
export async function saveCatalogItemAction(id: string | null, input: In<typeof config.saveCatalogItem, 2>) {
  return runAction(async () => config.saveCatalogItem(await getActor(), id, input), "Barang katalog disimpan.");
}
export async function saveBudgetAction(input: In<typeof config.saveBudget, 1>) {
  return runAction(async () => config.saveBudget(await getActor(), input), "Anggaran disimpan.");
}
export async function deleteBudgetAction(id: string) {
  return runAction(async () => config.deleteBudget(await getActor(), id), "Anggaran dihapus.");
}
export async function addHolidayAction(input: In<typeof config.addHoliday, 1>) {
  return runAction(async () => config.addHoliday(await getActor(), input), "Hari libur ditambahkan.");
}
export async function deleteHolidayAction(id: string) {
  return runAction(async () => config.deleteHoliday(await getActor(), id), "Hari libur dihapus.");
}
export async function saveSettingsAction(input: Partial<Settings>) {
  return runAction(async () => config.saveSettings(await getActor(), input), "Pengaturan disimpan.");
}
export async function retryEmailAction(id: string) {
  return runAction(async () => config.retryEmail(await getActor(), id), "Email dijadwalkan ulang.");
}
export async function testEmailAction(to: string) {
  return runAction(async () => config.queueTestEmail(await getActor(), to), "Email uji coba masuk antrean.");
}
