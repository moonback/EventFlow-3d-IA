import { expect, test } from "@playwright/test";
import { login, USERS } from "./helpers";

test.describe("Authentification et accès", () => {
  test("une page protégée redirige vers la connexion", async ({ page }) => {
    await page.goto("/customers");
    await expect(page).toHaveURL(/\/login\?next=%2Fcustomers/);
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });

  test("l'API refuse un appel non authentifié", async ({ request }) => {
    const res = await request.get("/api/customers");
    expect(res.status()).toBe(401);
    const scene = await request.get("/api/scene");
    expect(scene.status()).toBe(401);
  });

  test("identifiants invalides : message d'erreur, pas de session", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Adresse e-mail").fill(USERS.owner);
    await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText("E-mail ou mot de passe incorrect")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("connexion puis déconnexion", async ({ page, context }) => {
    await login(page, USERS.owner);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "ef_session");
    expect(session?.httpOnly).toBe(true);
    // La session est invalidée côté serveur à la déconnexion
    const res = await page.request.post("/api/auth/logout");
    expect(res.ok()).toBe(true);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Permissions côté serveur", () => {
  test("un profil lecture seule ne peut ni écrire ni administrer", async ({ page }) => {
    await login(page, USERS.readonly);
    // L'écriture est refusée par l'API même si l'appel est forgé à la main
    const res = await page.request.post("/api/customers", { data: { kind: "COMPANY", name: "Intrus SA" } });
    expect(res.status()).toBe(403);
    await page.goto("/settings/permissions");
    await expect(page).toHaveURL(/\/forbidden/);
  });

  test("un commercial n'accède pas aux réglages de l'organisation", async ({ page }) => {
    await login(page, USERS.sales);
    const current = (await (await page.request.get("/api/settings/organization")).json()).data;
    const { id: _id, slug: _slug, isDemo: _demo, ...settings } = current;
    // Charge utile valide : seul le contrôle de permission serveur peut la refuser
    const res = await page.request.put("/api/settings/organization", {
      data: { ...settings, name: "Piratage" },
    });
    expect(res.status()).toBe(403);
    const after = (await (await page.request.get("/api/settings/organization")).json()).data;
    expect(after.name).toBe(current.name);
  });
});
