import { expect, test } from "@playwright/test";
import { login, logout, SAMPLE_PDF } from "./helpers";

/**
 * Alur inti: pemohon membuat & mengirim pengajuan → atasan menyetujui →
 * pengajuan masuk antrean Purchasing. Memakai akun data demo.
 */
test("pengajuan → persetujuan → antrean purchasing", async ({ page }) => {
  const title = `Uji E2E mouse ${Date.now().toString(36)}`;

  // 1) Pemohon
  await login(page, "budi");
  await page.goto("/pengajuan/baru");
  await page.getByLabel(/^Judul/).fill(title);
  await page.getByLabel(/^Alasan kebutuhan/).fill("Mouse tim operasional rusak, dibutuhkan untuk pekerjaan harian.");
  const needed = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel(/Tanggal dibutuhkan/i).fill(needed);
  await page.getByLabel("Nama barang *").fill("Mouse nirkabel");
  await page.getByLabel("Spesifikasi *").fill("2.4GHz, baterai AA");
  await page.getByLabel("Jumlah *").fill("2");
  await page.getByLabel("Satuan *").fill("buah");
  await page.getByLabel("Estimasi harga / satuan").fill("150000");

  // Simpan draf agar lampiran dapat diunggah, lalu unggah memo.
  await page.getByRole("button", { name: /Simpan draf/i }).first().click();
  await expect(page).toHaveURL(/\/pengajuan\/[0-9a-f-]{36}\/edit/);
  await page.locator('input[type="file"]').setInputFiles(SAMPLE_PDF);
  await expect(page.getByText(SAMPLE_PDF.name)).toBeVisible();

  await page.getByRole("button", { name: /^Kirim pengajuan$/ }).click();
  await expect(page).toHaveURL(/\/pengajuan\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Menunggu Persetujuan").first()).toBeVisible();
  const requestUrl = page.url();
  const requestNumber = (await page.getByText(/PB-\d{4}-\d{5}/).first().textContent())!.match(/PB-\d{4}-\d{5}/)![0];

  // 2) Atasan langsung menyetujui
  await logout(page);
  await login(page, "sari");
  await page.goto("/persetujuan");
  await page.getByRole("link", { name: new RegExp(title) }).first().click();
  await page.getByRole("button", { name: /^Setujui$/ }).click();
  await expect(page.getByText(/disetujui/i).first()).toBeVisible();

  // 3) Pemohon melihat status terbaru
  await logout(page);
  await login(page, "budi");
  await page.goto(requestUrl);
  await expect(page.getByText(/Antrean Purchasing|Disetujui/).first()).toBeVisible();

  // 4) Purchasing melihat di antrean
  await logout(page);
  await login(page, "rina");
  await page.goto("/purchasing/antrean");
  await expect(page.getByText(requestNumber).first()).toBeVisible();
});

test("pengguna tanpa izin tidak dapat membuka halaman admin & laporan", async ({ page }) => {
  await login(page, "budi");
  await page.goto("/admin/pengguna");
  await expect(page).toHaveURL(/akses-ditolak/);
  const res = await page.request.get("/api/export?laporan=status&format=xlsx");
  expect(res.status()).toBe(403);
});

test("registrasi mandiri → aktivasi admin → login", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const username = `e2e${suffix}`;
  await page.goto("/daftar");
  await page.getByLabel("Nama lengkap").fill(`Pegawai Uji ${suffix}`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email kantor").fill(`${username}@contoh.id`);
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Operasional" }).click();
  await page.getByLabel("Password", { exact: true }).fill("Rahasia2026");
  await page.getByLabel("Ulangi password").fill("Rahasia2026");
  await page.getByRole("button", { name: /Daftar/ }).click();
  await expect(page.getByText(/diverifikasi Admin/i).first()).toBeVisible();

  await login(page, "admin");
  await page.goto("/admin/pengguna?status=PENDING_ACTIVATION");
  const row = page.getByRole("row", { name: new RegExp(username) });
  await row.getByRole("button", { name: "Aktifkan" }).click();
  await expect(page.getByText("Status akun diperbarui.")).toBeVisible();

  await logout(page);
  await login(page, username, "Rahasia2026");
  await expect(page).toHaveURL(/dashboard/);
});
