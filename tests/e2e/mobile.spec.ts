import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("tampilan ponsel: navigasi lewat menu & tanpa scroll horizontal", async ({ page }) => {
  await login(page, "budi");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: /Toggle Sidebar|Buka menu/i }).first().click();
  await page.getByRole("link", { name: "Pengajuan Saya", exact: true }).click();
  await expect(page).toHaveURL(/\/pengajuan$/);
});
