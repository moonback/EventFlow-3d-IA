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

test("parcours métier : client et événement (création, modification) → réservation (conflit puis confirmation)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const suffix = Date.now().toString(36);
  const customerName = `Société E2E ${suffix}`;
  const eventName = `Gala E2E ${suffix}`;
  let eventUrl = "";
  await login(page, USERS.owner);

  await test.step("création d'un client depuis le formulaire", async () => {
    await page.goto("/customers/new");
    await page.getByRole("button", { name: "Créer le client" }).click();
    await expect(page.getByText(/obligatoire|requis/i).first()).toBeVisible();
    await page.getByLabel("Raison sociale").fill(customerName);
    await page.getByLabel("E-mail").fill(`contact-${suffix}@exemple.test`);
    await page.getByRole("button", { name: "Créer le client" }).click();
    await page.waitForURL(/\/customers\/[a-z0-9]{20,}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(customerName);
    await page.goto(`/customers?q=${encodeURIComponent(customerName)}`);
    await expect(page.getByRole("link", { name: customerName })).toBeVisible();
  });

  await test.step("modification du client", async () => {
    await page.getByRole("link", { name: customerName }).click();
    await page.getByRole("link", { name: "Modifier" }).click();
    await page.getByLabel("Téléphone").fill("01 23 45 67 89");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.waitForURL(/\/customers\/[a-z0-9]{20,}$/);
    await expect(page.getByText("01 23 45 67 89")).toBeVisible();
  });

  await test.step("création d'un événement pour ce client", async () => {
    await page.goto("/events/new");
    await page.getByLabel("Nom de l'événement").fill(eventName);
    await selectByText(page.getByRole("combobox", { name: "Client", exact: true }), customerName);
    await page.getByLabel("Début de l'événement").fill("2027-09-18T18:00");
    await page.getByLabel("Fin de l'événement").fill("2027-09-18T23:30");
    await page.getByLabel("Début du montage").fill("2027-09-18T08:00");
    await page.getByLabel("Fin du démontage").fill("2027-09-19T04:00");
    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await page.waitForURL(/\/events\/[a-z0-9]{20,}$/);
    eventUrl = page.url();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(eventName);
  });

  await test.step("modification de l'événement", async () => {
    await page.goto(`${eventUrl}/edit`);
    await page.getByLabel("Nom du lieu").fill("Château E2E");
    await page.getByLabel("Nombre d'invités").fill("180");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.waitForURL(eventUrl);
    await expect(page.getByText("Château E2E").first()).toBeVisible();
  });

  await test.step("réservation : conflit de stock détecté puis confirmation", async () => {
    expect(eventUrl).not.toBe("");
    const eventId = eventUrl.split("/").pop()!;
    await page.goto(`/reservations/new?eventId=${eventId}`);
    const product = page.getByLabel("Référence ligne 1");
    await selectByText(product, "Chaise pliante noire");
    const quantity = page.getByLabel("Quantité ligne 1");

    // Quantité supérieure au parc : refus de confirmation (vérifié aussi côté serveur)
    await quantity.fill("100000");
    await expect(page.getByText("Disponibilité insuffisante sur la période")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer et confirmer" })).toBeDisabled();

    await quantity.fill("20");
    await expect(page.getByText("Disponibilité insuffisante sur la période")).toHaveCount(0);
    await page.getByRole("button", { name: "Enregistrer et confirmer" }).click();
    await page.waitForURL(/\/reservations\/[a-z0-9]{20,}$/);
    await expect(page.getByText("Confirmée").first()).toBeVisible();
    await expect(page.getByText("Chaise pliante noire").first()).toBeVisible();
  });

  await test.step("le serveur refuse une confirmation forgée au-delà du stock", async () => {
    const eventId = eventUrl.split("/").pop()!;
    const products = (
      await (await page.request.get("/api/inventory/search?q=Chaise%20pliante%20noire")).json()
    ).data as { id: string }[];
    // Un brouillon peut dépasser le stock ; c'est la confirmation qui bloque le stock et doit être refusée
    const draft = await page.request.post("/api/reservations", {
      data: { eventId, lines: [{ productId: products[0]!.id, quantity: 100000 }] },
    });
    expect(draft.status()).toBe(200);
    const { id } = (await draft.json()).data as { id: string };
    const confirm = await page.request.post(`/api/reservations/${id}/confirm`, { data: {} });
    expect(confirm.status()).toBe(409);
  });
});
