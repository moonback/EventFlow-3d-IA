import { expect, test } from "@playwright/test";
import { expectNoErrorBoundary, login, trackErrors, USERS } from "./helpers";

const ROUTES = [
  "/dashboard",
  "/customers",
  "/events",
  "/events/tasks",
  "/inventory",
  "/inventory/movements",
  "/inventory/categories",
  "/reservations",
  "/warehouse",
  "/logistics",
  "/maintenance",
  "/quotes",
  "/invoices",
  "/vehicles",
  "/team",
  "/planning",
  "/suppliers",
  "/purchases",
  "/finance",
  "/reports",
  "/documents",
  "/imports",
  "/notifications",
  "/settings",
  "/settings/organization",
  "/settings/members",
  "/settings/permissions",
  "/settings/audit",
  "/settings/profile",
];

test("toutes les pages principales se chargent sans erreur", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await login(page, USERS.owner);
  for (const route of ROUTES) {
    const res = await page.goto(route);
    expect(res?.status(), route).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 }), route).toBeVisible();
    await expectNoErrorBoundary(page);
  }
  expect(errors).toEqual([]);
});

test("une ressource inconnue renvoie une page 404", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/customers/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText(/n.existe pas/)).toBeVisible();
});
