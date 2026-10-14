import { expect, type Page } from "@playwright/test";
import { E2E_PASSWORD } from "./constants";

export const USERS = {
  owner: "camille.laurent@demo.eventflow.local",
  sales: "thomas.roux@demo.eventflow.local",
  readonly: "paul.mercier@demo.eventflow.local",
} as const;

export async function login(page: Page, email: string, password = E2E_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");
}

/** Collecte les erreurs JS de la page pour vérifier l'absence d'erreur au chargement. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

export async function expectNoErrorBoundary(page: Page) {
  await expect(page.getByText("Une erreur est survenue")).toHaveCount(0);
}
