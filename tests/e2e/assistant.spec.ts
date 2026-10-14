import { expect, test, type Page } from "@playwright/test";
import { login, trackErrors, USERS } from "./helpers";

/**
 * Assistant Eric de bout en bout : navigateur → passerelle réelle (droits, outils, confirmations)
 * → Gemini simulé par un script (tests/e2e/fake-gemini-gateway.ts) → base E2E.
 */
async function novaStatus(page: Page) {
  const res = await page.request.get("/api/events?q=Nova%20X");
  const body = (await res.json()) as { data: { items: { name: string; status: string }[] } };
  return body.data.items.find((e) => e.name === "Lancement Nova X")!.status;
}

async function startConversation(page: Page) {
  await page.goto("/world");
  await page.getByRole("button", { name: "Ouvrir la conversation avec Eric" }).click();
  const panel = page.getByRole("region", { name: "Conversation avec Eric" });
  await panel.getByRole("button", { name: "Démarrer la conversation" }).click();
  await expect(panel.getByRole("status").first()).toHaveText(/À l'écoute|Eric parle/);
  return panel;
}

async function say(panel: ReturnType<Page["getByRole"]>, text: string) {
  await panel.getByLabel("Message à Eric").fill(text);
  await panel.getByRole("button", { name: "Envoyer" }).click();
}

test.describe.serial("Assistant Eric", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.owner);
  });

  test("une action refusée ne modifie rien", async ({ page }) => {
    const errors = trackErrors(page);
    const panel = await startConversation(page);
    await say(panel, "Passe Nova X en prêt à partir");
    const card = panel.getByRole("group", { name: "Action proposée : Changer le statut de l'événement" });
    await expect(card).toContainText("Lancement Nova X");
    await expect(card).toContainText("Confirmé → Prêt à partir");
    await card.getByRole("button", { name: "Refuser" }).click();
    await expect(panel.getByText("D'accord, je ne change rien.")).toBeVisible();
    expect(await novaStatus(page)).toBe("CONFIRMED");
    expect(errors).toEqual([]);
  });

  test("une action confirmée par un clic est exécutée", async ({ page }) => {
    const panel = await startConversation(page);
    await say(panel, "Passe Nova X en prêt à partir");
    const card = panel.getByRole("group", { name: "Action proposée : Changer le statut de l'événement" });
    await expect(card).toBeVisible();
    // Rien n'est écrit tant que l'utilisateur n'a pas cliqué
    expect(await novaStatus(page)).toBe("CONFIRMED");
    await card.getByRole("button", { name: "Confirmer" }).click();
    await expect(panel.getByText("C'est fait.")).toBeVisible();
    expect(await novaStatus(page)).toBe("READY");
  });

  test("Eric montre un véhicule dans la scène", async ({ page }) => {
    const panel = await startConversation(page);
    await say(panel, "Montre-moi le Renault Master");
    await expect(panel.getByText("Voici le Renault Master.")).toBeVisible();
    // La fiche du véhicule s'ouvre (panneau de scène)
    await expect(page.getByText("GA-125-EV").first()).toBeVisible();
  });
});
