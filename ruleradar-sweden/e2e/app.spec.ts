import { test, expect } from "@playwright/test";

test("public funnel carries the Team plan into signup", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fånga regeländringen innan den blir ett kundfel." })).toBeVisible();
  await page.getByRole("link", { name: "Prova gratis" }).click();
  await expect(page.getByRole("heading", { name: "Skapa er bevakningsyta." })).toBeVisible();
  await expect(page.getByText("Team", { exact: true })).toBeVisible();
});

test("pricing exposes transparent plan comparison", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Välj hur många som ska hinna se ändringen." })).toBeVisible();
  await expect(page.getByText("799 kr", { exact: true })).toBeVisible();
  await expect(page.getByText("per månad, exkl. moms").first()).toBeVisible();
});

test("fixture dashboard exposes the alert workflow", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Alertar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Team" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Senaste källändringar" })).toBeVisible();
});

test("admin review queue exposes guarded decisions in fixture mode", async ({ page }) => {
  await page.goto("/admin/review");
  await expect(page.getByRole("heading", { name: "Granskningskö" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Godkänn och leverera" }).first()).toBeVisible();
});

test("admin dashboard exposes worker proof and the pilot pipeline", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Driftöversikt" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pilotpipeline" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Driftbevis" })).toBeVisible();
  await expect(page.locator("dt", { hasText: "Misslyckade leveranser" })).toBeVisible();
});
