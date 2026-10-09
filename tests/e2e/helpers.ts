import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "Demo12345";

export async function login(page: Page, username: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel(/Username atau email/i).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^Masuk$/ }).click();
  await expect(page).toHaveURL(/\/(dashboard|ganti-password)/);
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}

/** PDF minimal yang lolos verifikasi tipe file (magic bytes %PDF). */
export const SAMPLE_PDF = {
  name: "memo-kebutuhan.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"),
};
