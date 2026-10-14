import { expect, test, type Locator } from "@playwright/test";
import { login, USERS } from "./helpers";

async function selectByText(select: Locator, text: string) {
  const value = await select.evaluate(
    (el: HTMLSelectElement, t) => Array.from(el.options).find((o) => o.text.includes(t))?.value ?? null,
    text,
  );
  expect(value, `option « ${text} »`).toBeTruthy();
  await select.selectOption(value!);
}

test("portail prestataires : une freelance accepte une mission proposée", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const suffix = Date.now().toString(36);
  const eventName = `Séminaire portail ${suffix}`;
  let eventUrl = "";
  await login(page, USERS.owner);

  await test.step("création d'un événement dédié", async () => {
    await page.goto("/events/new");
    await page.getByLabel("Nom de l'événement").fill(eventName);
    await selectByText(page.getByRole("combobox", { name: "Client", exact: true }), "Nova Tech Industries");
    await page.getByLabel("Début de l'événement").fill("2028-03-14T09:00");
    await page.getByLabel("Fin de l'événement").fill("2028-03-14T18:00");
    await page.getByLabel("Début du montage").fill("2028-03-14T07:00");
    await page.getByLabel("Fin du démontage").fill("2028-03-14T21:00");
    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await page.waitForURL(/\/events\/[a-z0-9]{20,}$/);
    eventUrl = page.url();
  });

  await test.step("proposition de la mission à une freelance", async () => {
    await page.getByRole("tab", { name: /Équipe/ }).click();
    await page.getByRole("button", { name: "Affecter" }).click();
    const dialog = page.getByRole("dialog");
    await selectByText(dialog.getByRole("combobox", { name: "Collaborateur" }), "Chloé Dubois");
    await dialog.getByLabel("Rôle sur l'événement").fill("Vidéo");
    // Freelance : la proposition est cochée par défaut
    await expect(dialog.getByRole("checkbox")).toBeChecked();
    await dialog.getByRole("button", { name: "Proposer" }).click();
    await expect(page.getByText(/Proposition/).first()).toBeVisible();
    await expect(page.getByText("Proposée").first()).toBeVisible();
  });

  let link = "";
  await test.step("création du lien du portail depuis la fiche", async () => {
    await page.getByRole("link", { name: "Chloé Dubois" }).first().click();
    await page.waitForURL(/\/team\/[a-z0-9]{20,}$/);
    await page.getByRole("button", { name: /lien/i }).first().click();
    link = await page.getByTestId("portal-link").inputValue();
    expect(link).toContain("/portal?token=");
  });

  await test.step("acceptation depuis le portail, sans session", async () => {
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await expect(anon.getByRole("heading", { name: /Bonjour Chloé Dubois/ })).toBeVisible();
    await anon.getByRole("button", { name: new RegExp(`Accepter la mission .*Vidéo`) }).first().click();
    await expect(anon.getByText("Mission acceptée")).toBeVisible();
    await expect(anon.getByText(eventName)).toBeVisible();
    await anon.context().close();
  });

  await test.step("la régie voit la mission confirmée", async () => {
    await page.goto(eventUrl);
    await page.getByRole("tab", { name: /Équipe/ }).click();
    await expect(page.getByText("Confirmée").first()).toBeVisible();
  });
});

test("portail prestataires : un lien invalide n'expose rien", async ({ browser }) => {
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/portal?token=invalide");
  await expect(anon.getByText("Lien invalide")).toBeVisible();
  expect(anon.url()).not.toContain("/login");
  await anon.context().close();
});
