import { test, expect } from "@playwright/test";

test("sign up flow reaches dashboard navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Start trial" }).first().click();
  await expect(page.getByRole("heading", { name: "Pricing" })).toBeVisible();
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Alerts" })).toBeVisible();
});

test("admin review queue exposes review actions", async ({ page }) => {
  await page.goto("/admin/review");
  await expect(page.getByRole("heading", { name: "Review Queue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" }).first()).toBeVisible();
});
