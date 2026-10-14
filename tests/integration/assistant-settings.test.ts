import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { assistantSettingsSchema } from "@/features/settings/schemas";
import type { ServerMessage } from "@/features/assistant/protocol";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { assistantOrgSettings, isAssistantAvailable } from "@/server/assistant/availability";
import { startAssistantGateway, type AssistantGateway } from "@/server/assistant/gateway";
import { GeminiCredentialsMissingError, geminiClientOptions, type LiveConnectOptions, type LiveConnector } from "@/server/assistant/live-session";
import type { AuthContext } from "@/server/auth/context";
import { generateToken, hashToken } from "@/server/auth/tokens";
import { getAssistantSettings, updateAssistantSettings } from "@/server/services/settings-service";
import { createOrg, createUserInOrg } from "../helpers/factories";

const ORIGIN = "http://localhost:3000";
const connects: LiveConnectOptions[] = [];
const connector: LiveConnector = async (options) => {
  connects.push(options);
  return { sendAudio() {}, sendAudioEnd() {}, sendText() {}, sendToolResponses() {}, close() {} };
};

let owner: AuthContext;
let sales: AuthContext;
let cookie: string;
let gateway: AssistantGateway;

async function sessionCookie(ctx: AuthContext) {
  const token = generateToken();
  await db.session.create({ data: { tokenHash: hashToken(token), userId: ctx.userId, organizationId: ctx.organizationId, expiresAt: new Date(Date.now() + 3_600_000) } });
  return `ef_session=${token}`;
}

/** Ouvre une connexion ; rejette avec le code HTTP si l'upgrade est refusé. */
function connect(): Promise<{ messages: ServerMessage[]; closed: Promise<number> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${gateway.port}/ws/assistant`, { headers: { Cookie: cookie, Origin: ORIGIN } });
    const messages: ServerMessage[] = [];
    ws.on("message", (data, isBinary) => {
      if (!isBinary) messages.push(JSON.parse(String(data)) as ServerMessage);
    });
    const closed = new Promise<number>((r) => ws.on("close", (code) => r(code)));
    ws.on("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.on("open", () => resolve({ messages, closed }));
  });
}

const settings = (patch: Partial<{ enabled: boolean; voice: string | null; maxSessionMinutes: number | null; apiKey: string | null }>) =>
  updateAssistantSettings(owner, assistantSettingsSchema.parse({ enabled: true, voice: null, maxSessionMinutes: null, ...patch }));

beforeAll(async () => {
  const org = await createOrg("Réglages Eric");
  owner = await createUserInOrg(org.id, "OWNER");
  sales = await createUserInOrg(org.id, "SALES");
  cookie = await sessionCookie(owner);
  gateway = await startAssistantGateway({ connector, port: 0, host: "127.0.0.1", allowedOrigins: [ORIGIN], enabled: true, revalidateMs: 50, log: () => undefined });
});

afterAll(async () => {
  await gateway.close();
});

describe("réglages de l'assistant Eric (Paramètres → Organisation)", () => {
  it("est activé par défaut, avec la voix et la durée du serveur", async () => {
    const s = await getAssistantSettings(owner);
    expect(s).toMatchObject({ enabled: true, voice: null, maxSessionMinutes: null });
    expect(typeof s.serverEnabled).toBe("boolean");
    expect(await assistantOrgSettings(owner.organizationId)).toEqual({ orgEnabled: true, voice: undefined, maxSessionMinutes: undefined });
  });

  it("enregistre activation, voix et durée, et trace la modification dans le journal d'audit", async () => {
    const saved = await settings({ enabled: false, voice: "Kore", maxSessionMinutes: 10 });
    expect(saved).toMatchObject({ enabled: false, voice: "Kore", maxSessionMinutes: 10 });
    expect(await assistantOrgSettings(owner.organizationId)).toEqual({ orgEnabled: false, voice: "Kore", maxSessionMinutes: 10 });
    const log = await db.auditLog.findFirst({ where: { organizationId: owner.organizationId, action: "settings.assistant_updated" }, orderBy: { createdAt: "desc" } });
    expect(log?.actorId).toBe(owner.userId);
    await settings({});
  });

  it("refuse la modification sans la permission settings:manage", async () => {
    await expect(updateAssistantSettings(sales, { enabled: false, voice: null, maxSessionMinutes: null })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getAssistantSettings(sales)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await assistantOrgSettings(owner.organizationId)).orgEnabled).toBe(true);
  });

  it("valide la voix et la durée", () => {
    expect(assistantSettingsSchema.safeParse({ enabled: true, voice: "Inconnue", maxSessionMinutes: null }).success).toBe(false);
    expect(assistantSettingsSchema.safeParse({ enabled: true, voice: null, maxSessionMinutes: 0 }).success).toBe(false);
    expect(assistantSettingsSchema.safeParse({ enabled: true, voice: null, maxSessionMinutes: 241 }).success).toBe(false);
    expect(assistantSettingsSchema.safeParse({ enabled: true, voice: null, maxSessionMinutes: 2.5 }).success).toBe(false);
    expect(assistantSettingsSchema.safeParse({ enabled: "oui", voice: null, maxSessionMinutes: null }).success).toBe(false);
  });

  it("la base refuse une durée hors bornes, même sans passer par l'API", async () => {
    await expect(db.organization.update({ where: { id: owner.organizationId }, data: { assistantMaxSessionMinutes: 0 } })).rejects.toThrow();
  });

  it("n'est disponible que si le serveur ET l'organisation l'activent", async () => {
    const serverEnabled = process.env.ASSISTANT_ENABLED === "true";
    expect(await isAssistantAvailable(owner.organizationId)).toBe(serverEnabled);
    await settings({ enabled: false });
    expect(await isAssistantAvailable(owner.organizationId)).toBe(false);
    await settings({});
  });
});

describe("passerelle : réglages de l'organisation appliqués côté serveur", () => {
  it("refuse la connexion lorsque l'organisation a désactivé Eric (403)", async () => {
    await settings({ enabled: false });
    await expect(connect()).rejects.toThrow("HTTP 403");
    await settings({});
  });

  it("transmet la voix choisie à Gemini Live", async () => {
    await settings({ voice: "Puck" });
    const before = connects.length;
    const client = await connect();
    await expect.poll(() => connects.length).toBe(before + 1);
    expect(connects.at(-1)?.voice).toBe("Puck");
    await settings({});
    void client;
  });

  it("coupe une conversation en cours si Eric est désactivé pendant celle-ci", async () => {
    const client = await connect();
    await settings({ enabled: false });
    expect(await client.closed).toBe(4403);
    expect(client.messages.some((m) => m.type === "error" && m.code === "DISABLED")).toBe(true);
    await settings({});
  });
});

describe("clé API Gemini de l'organisation", () => {
  const KEY = "AIzaTestCleDeDemonstration0123456789abcd";

  it("est chiffrée en base, jamais renvoyée, et seule l'opération est auditée", async () => {
    const saved = await settings({ apiKey: KEY });
    expect(saved).toMatchObject({ apiKeyConfigured: true, apiKeyHint: "abcd", apiKeyUnreadable: false, encryptionReady: true });
    expect(JSON.stringify(saved)).not.toContain(KEY);
    const row = await db.organization.findUniqueOrThrow({ where: { id: owner.organizationId }, select: { assistantApiKeyEncrypted: true } });
    expect(row.assistantApiKeyEncrypted).toMatch(/^v1:/);
    expect(row.assistantApiKeyEncrypted).not.toContain(KEY);
    // Lue en clair uniquement côté serveur, pour la passerelle
    expect((await assistantOrgSettings(owner.organizationId)).apiKey).toBe(KEY);
    const logs = await db.auditLog.findMany({ where: { organizationId: owner.organizationId, action: "settings.assistant_updated" } });
    expect(JSON.stringify(logs)).not.toContain(KEY);
    expect(logs.some((l) => JSON.stringify(l).includes('"apiKey":"set"'))).toBe(true);
  });

  it("est conservée quand le champ est laissé vide, puis supprimable", async () => {
    await updateAssistantSettings(owner, assistantSettingsSchema.parse({ enabled: true, voice: "Puck", maxSessionMinutes: null }));
    expect((await assistantOrgSettings(owner.organizationId)).apiKey).toBe(KEY);
    const removed = await settings({ apiKey: null });
    expect(removed).toMatchObject({ apiKeyConfigured: false, apiKeyHint: null });
    expect((await assistantOrgSettings(owner.organizationId)).apiKey).toBeUndefined();
  });

  it("refuse une clé mal formée", () => {
    expect(assistantSettingsSchema.safeParse({ enabled: true, voice: null, maxSessionMinutes: null, apiKey: "trop-courte" }).success).toBe(false);
    expect(assistantSettingsSchema.safeParse({ enabled: true, voice: null, maxSessionMinutes: null, apiKey: "AIza cle avec espaces 0123456789" }).success).toBe(false);
  });

  it("est transmise à Gemini Live par la passerelle (prioritaire sur la configuration du serveur)", async () => {
    await settings({ apiKey: KEY });
    const before = connects.length;
    await connect();
    await expect.poll(() => connects.length).toBe(before + 1);
    expect(connects.at(-1)?.apiKey).toBe(KEY);
    await settings({ apiKey: null });
  });

  it("choisit les identifiants : clé de l'organisation > clé du serveur (developer) > Google Cloud (enterprise)", () => {
    const server = { GEMINI_BACKEND: "enterprise" as const, GEMINI_API_KEY: "cle-serveur", GOOGLE_CLOUD_PROJECT: "projet", GOOGLE_CLOUD_LOCATION: "eu" };
    expect(geminiClientOptions(KEY, server)).toEqual({ apiKey: KEY });
    expect(geminiClientOptions(undefined, { ...server, GEMINI_BACKEND: "developer" })).toEqual({ apiKey: "cle-serveur" });
    expect(geminiClientOptions(undefined, server)).toEqual({ enterprise: true, project: "projet", location: "eu" });
    expect(() => geminiClientOptions(undefined, { ...server, GOOGLE_CLOUD_PROJECT: undefined })).toThrow(GeminiCredentialsMissingError);
    expect(() => geminiClientOptions(undefined, { ...server, GEMINI_BACKEND: "developer", GEMINI_API_KEY: undefined })).toThrow(GeminiCredentialsMissingError);
  });

  it("sans aucune clé ni identifiants serveur : message explicite au lieu de « momentanément indisponible »", async () => {
    const missing: LiveConnector = async () => {
      throw new GeminiCredentialsMissingError();
    };
    const real = await startAssistantGateway({ connector: missing, port: 0, host: "127.0.0.1", allowedOrigins: [ORIGIN], enabled: true, log: () => undefined });
    try {
      const messages: ServerMessage[] = [];
      const ws = new WebSocket(`ws://127.0.0.1:${real.port}/ws/assistant`, { headers: { Cookie: cookie, Origin: ORIGIN } });
      ws.on("message", (data, isBinary) => {
        if (!isBinary) messages.push(JSON.parse(String(data)) as ServerMessage);
      });
      const code = await new Promise<number>((r) => ws.on("close", (c) => r(c)));
      expect(code).toBe(4502);
      const error = messages.find((m) => m.type === "error");
      expect(error).toMatchObject({ code: "LIVE_UNAVAILABLE" });
      expect(error && "message" in error ? error.message : "").toContain("Paramètres → Organisation");
    } finally {
      await real.close();
    }
  });
});
