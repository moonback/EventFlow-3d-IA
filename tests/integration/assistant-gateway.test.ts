import type { LiveServerMessage } from "@google/genai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ServerMessage } from "@/features/assistant/protocol";
import { db } from "@/lib/db";
import type { AuthContext } from "@/server/auth/context";
import { generateToken, hashToken } from "@/server/auth/tokens";
import { startAssistantGateway, type AssistantGateway, type GatewayOptions } from "@/server/assistant/gateway";
import type { LiveConnectOptions, LiveConnector, LiveSessionLike, ToolResponse } from "@/server/assistant/live-session";
import { createEvent, createOrg, createUserInOrg, day } from "../helpers/factories";

const ORIGIN = "http://localhost:3000";

/** Faux Gemini Live : enregistre ce que la passerelle envoie et permet d'émettre des messages serveur. */
class FakeLive implements LiveSessionLike {
  audio: Buffer[] = [];
  texts: string[] = [];
  toolResponses: ToolResponse[][] = [];
  audioEnds = 0;
  closed = false;
  constructor(readonly options: LiveConnectOptions) {}
  sendAudio(pcm: Buffer) {
    this.audio.push(pcm);
  }
  sendAudioEnd() {
    this.audioEnds++;
  }
  sendText(text: string) {
    this.texts.push(text);
  }
  sendToolResponses(responses: ToolResponse[]) {
    this.toolResponses.push(responses);
  }
  close() {
    this.closed = true;
  }
  emit(message: Partial<LiveServerMessage>) {
    this.options.events.onMessage(message as LiveServerMessage);
  }
}

const sessions: FakeLive[] = [];
const connector: LiveConnector = async (options) => {
  const s = new FakeLive(options);
  sessions.push(s);
  return s;
};

async function sessionToken(ctx: AuthContext) {
  const token = generateToken();
  await db.session.create({ data: { tokenHash: hashToken(token), userId: ctx.userId, organizationId: ctx.organizationId, expiresAt: new Date(Date.now() + 3_600_000) } });
  return token;
}

const gateways: AssistantGateway[] = [];
async function gateway(overrides: Partial<GatewayOptions> = {}) {
  const g = await startAssistantGateway({ connector, port: 0, host: "127.0.0.1", allowedOrigins: [ORIGIN], enabled: true, log: () => undefined, ...overrides });
  gateways.push(g);
  return g;
}

interface Client {
  ws: WebSocket;
  messages: ServerMessage[];
  binaries: Buffer[];
  closed: Promise<number>;
  waitFor(predicate: (m: ServerMessage) => boolean): Promise<ServerMessage>;
}

/** Ouvre une connexion ; rejette avec le code HTTP si l'upgrade est refusé. */
function connect(port: number, headers: { cookie?: string; origin?: string }): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/assistant`, { headers: { ...(headers.cookie ? { Cookie: headers.cookie } : {}), Origin: headers.origin ?? ORIGIN } });
    const messages: ServerMessage[] = [];
    const binaries: Buffer[] = [];
    const waiters: { predicate: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
    ws.on("message", (data, isBinary) => {
      if (isBinary) return binaries.push(data as Buffer);
      const m = JSON.parse(String(data)) as ServerMessage;
      messages.push(m);
      for (const w of waiters.splice(0)) {
        if (w.predicate(m)) w.resolve(m);
        else waiters.push(w);
      }
    });
    const closed = new Promise<number>((r) => ws.on("close", (code) => r(code)));
    ws.on("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.on("open", () =>
      resolve({
        ws,
        messages,
        binaries,
        closed,
        waitFor: (predicate) => {
          const found = messages.find(predicate);
          return found ? Promise.resolve(found) : new Promise((r) => waiters.push({ predicate, resolve: r }));
        },
      }),
    );
  });
}

const isReady = (m: ServerMessage) => m.type === "state" && m.state === "ready";
const until = async (check: () => boolean, ms = 2_000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("Délai dépassé");
    await new Promise((r) => setTimeout(r, 10));
  }
};

let ctx: AuthContext;
let cookie: string;
let port: number;

beforeAll(async () => {
  const org = await createOrg("Assistant");
  ctx = await createUserInOrg(org.id, "LOGISTICS_MANAGER");
  cookie = `ef_session=${await sessionToken(ctx)}`;
  port = (await gateway()).port;
});

afterAll(async () => {
  for (const g of gateways) await g.close();
});

describe("upgrade WebSocket", () => {
  it("refuse une connexion sans session (401)", async () => {
    await expect(connect(port, {})).rejects.toThrow("HTTP 401");
    await expect(connect(port, { cookie: "ef_session=inconnu" })).rejects.toThrow("HTTP 401");
  });

  it("refuse une origine étrangère, même avec une session valide (403)", async () => {
    await expect(connect(port, { cookie, origin: "https://evil.example" })).rejects.toThrow("HTTP 403");
  });

  it("refuse un rôle sans la permission assistant:use (403)", async () => {
    const reader = await createUserInOrg(ctx.organizationId, "READ_ONLY");
    await expect(connect(port, { cookie: `ef_session=${await sessionToken(reader)}` })).rejects.toThrow("HTTP 403");
  });

  it("refuse une session expirée (401)", async () => {
    const other = await createUserInOrg(ctx.organizationId, "SALES");
    const token = generateToken();
    await db.session.create({ data: { tokenHash: hashToken(token), userId: other.userId, organizationId: other.organizationId, expiresAt: new Date(Date.now() - 1000) } });
    await expect(connect(port, { cookie: `ef_session=${token}` })).rejects.toThrow("HTTP 401");
  });

  it("refuse tout quand l'assistant est désactivé (503)", async () => {
    const off = await gateway({ enabled: false });
    await expect(connect(off.port, { cookie })).rejects.toThrow("HTTP 503");
  });
});

describe("conversation", () => {
  it("relaie l'audio, le texte, les transcriptions et les interruptions", async () => {
    const before = sessions.length;
    const c = await connect(port, { cookie });
    await c.waitFor(isReady);
    const live = sessions[before]!;
    expect(live.options.systemInstruction).toContain("Eric");
    expect(live.options.systemInstruction).toContain(ctx.user.name);
    expect(live.options.resumeHandle).toBeUndefined();

    // Montant : audio PCM (longueur paire), trames invalides ignorées, texte et fin de flux
    c.ws.send(Buffer.alloc(640, 1));
    c.ws.send(Buffer.alloc(641, 1));
    c.ws.send(Buffer.alloc(40_000, 1));
    c.ws.send(JSON.stringify({ type: "text", text: "Bonjour Eric" }));
    c.ws.send(JSON.stringify({ type: "audio_end" }));
    await until(() => live.texts.length === 1 && live.audioEnds === 1);
    expect(live.audio.map((b) => b.length)).toEqual([640]);
    expect(live.texts).toEqual(["Bonjour Eric"]);

    // Descendant : voix d'Eric en binaire, transcriptions, interruption, fin de tour
    const voice = Buffer.from([1, 2, 3, 4]);
    live.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: voice.toString("base64"), mimeType: "audio/pcm;rate=24000" } }] } } });
    live.emit({ serverContent: { inputTranscription: { text: "Bonjour" } } });
    live.emit({ serverContent: { outputTranscription: { text: "Bonjour, je suis Eric." } } });
    live.emit({ serverContent: { interrupted: true } });
    live.emit({ serverContent: { turnComplete: true } });
    await c.waitFor((m) => m.type === "turn_complete");
    expect(c.binaries).toEqual([voice]);
    expect(c.messages).toEqual(
      expect.arrayContaining([
        { type: "transcript", role: "user", text: "Bonjour" },
        { type: "transcript", role: "eric", text: "Bonjour, je suis Eric." },
        { type: "interrupted" },
      ]),
    );

    // Un message inconnu est signalé sans fermer la conversation
    c.ws.send(JSON.stringify({ type: "tool_call", name: "supprimer" }));
    await c.waitFor((m) => m.type === "error" && m.code === "BAD_MESSAGE");
    expect(c.ws.readyState).toBe(WebSocket.OPEN);

    // Raccrocher ferme la session Live
    c.ws.send(JSON.stringify({ type: "hangup" }));
    expect(await c.closed).toBe(4000);
    await until(() => live.closed);
  });

  it("reprend la session Live après un goAway avec la dernière poignée", async () => {
    const before = sessions.length;
    const c = await connect(port, { cookie });
    await c.waitFor(isReady);
    const first = sessions[before]!;
    first.emit({ sessionResumptionUpdate: { resumable: true, newHandle: "poignee-1" } });
    first.emit({ goAway: { timeLeft: "10s" } });
    await until(() => sessions.length === before + 2);
    const second = sessions[before + 1]!;
    expect(second.options.resumeHandle).toBe("poignee-1");
    expect(first.closed).toBe(true);
    // Les messages tardifs de l'ancienne session sont ignorés ; la nouvelle relaie normalement
    first.emit({ serverContent: { outputTranscription: { text: "fantôme" } } });
    second.emit({ serverContent: { outputTranscription: { text: "toujours là" } } });
    await c.waitFor((m) => m.type === "transcript" && m.text === "toujours là");
    expect(c.messages.some((m) => m.type === "transcript" && m.text === "fantôme")).toBe(false);
    c.ws.close();
    await c.closed;
  });

  it("ferme la conversation si Gemini coupe sans poignée de reprise", async () => {
    const before = sessions.length;
    const c = await connect(port, { cookie });
    await c.waitFor(isReady);
    sessions[before]!.options.events.onClose("network");
    await c.waitFor((m) => m.type === "error" && m.code === "LIVE_UNAVAILABLE");
    expect(await c.closed).toBe(4502);
  });

  it("une nouvelle connexion du même utilisateur remplace l'ancienne", async () => {
    const before = sessions.length;
    const first = await connect(port, { cookie });
    await first.waitFor(isReady);
    const second = await connect(port, { cookie });
    expect(await first.closed).toBe(4001);
    await second.waitFor(isReady);
    expect(sessions[before]!.closed).toBe(true);
    second.ws.close();
    await second.closed;
  });

  it("signale l'indisponibilité de Gemini à l'ouverture", async () => {
    const down = await gateway({
      connector: async () => {
        throw new Error("PERMISSION_DENIED");
      },
    });
    const c = await connect(down.port, { cookie });
    await c.waitFor((m) => m.type === "error" && m.code === "LIVE_UNAVAILABLE");
    expect(await c.closed).toBe(4502);
  });
});

describe("minuteries et revalidation", () => {
  it("ferme une conversation inactive", async () => {
    const g = await gateway({ idleMs: 300 });
    const c = await connect(g.port, { cookie });
    await c.waitFor((m) => m.type === "error" && m.code === "IDLE_TIMEOUT");
    expect(await c.closed).toBe(4002);
  });

  it("ferme la conversation quand la session EventFlow est révoquée", async () => {
    const user = await createUserInOrg(ctx.organizationId, "SALES");
    const token = await sessionToken(user);
    const g = await gateway({ revalidateMs: 150 });
    const c = await connect(g.port, { cookie: `ef_session=${token}` });
    await c.waitFor(isReady);
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    await c.waitFor((m) => m.type === "error" && m.code === "SESSION_EXPIRED");
    expect(await c.closed).toBe(4401);
  });
});

describe("outils", () => {
  it("déclare les outils « données » au modèle", async () => {
    const before = sessions.length;
    const c = await connect(port, { cookie });
    await c.waitFor(isReady);
    const names = sessions[before]!.options.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["search", "list_events", "get_event", "find_equipment", "finance_overview"]));
    c.ws.close();
    await c.closed;
  });

  it("exécute un appel avec les droits de l'utilisateur, le signale au navigateur et le journalise", async () => {
    const event = await createEvent(ctx.organizationId, day(20), day(21));
    const before = sessions.length;
    const c = await connect(port, { cookie });
    await c.waitFor(isReady);
    const live = sessions[before]!;
    live.emit({
      toolCall: {
        functionCalls: [
          { id: "c1", name: "search", args: { query: event.name } },
          // Rôle logistique : pas de finance:read
          { id: "c2", name: "get_event_financials", args: { event_id: event.id } },
        ],
      },
    });
    await until(() => live.toolResponses.length === 1);
    const [search, finance] = live.toolResponses[0]!;
    expect(search).toMatchObject({ id: "c1", name: "search" });
    expect(search!.response.output).toEqual(expect.arrayContaining([expect.objectContaining({ type: "event", id: event.id })]));
    expect(finance).toMatchObject({ id: "c2", response: { error: "FORBIDDEN" } });
    await c.waitFor((m) => m.type === "tool" && m.id === "c2" && m.state === "error");
    expect(c.messages).toContainEqual({ type: "tool", id: "c1", label: "recherche dans EventFlow", state: "running" });
    expect(c.messages).toContainEqual({ type: "tool", id: "c1", label: "recherche dans EventFlow", state: "done" });
    const logged = await db.assistantToolCall.findMany({ where: { userId: ctx.userId, tool: { in: ["search", "get_event_financials"] } }, orderBy: { tool: "desc" } });
    expect(logged.map((l) => [l.tool, l.ok, l.errorCode])).toEqual([
      ["search", true, null],
      ["get_event_financials", false, "FORBIDDEN"],
    ]);
    c.ws.close();
    await c.closed;
  });

  it("n'envoie pas la réponse d'un appel annulé par le modèle", async () => {
    let release: () => void = () => undefined;
    const g = await gateway({ runTool: () => new Promise((resolve) => (release = () => resolve({ ok: true, output: "tard" }))) });
    const before = sessions.length;
    const c = await connect(g.port, { cookie });
    await c.waitFor(isReady);
    const live = sessions[before]!;
    live.emit({ toolCall: { functionCalls: [{ id: "lent", name: "search", args: { query: "x" } }] } });
    await c.waitFor((m) => m.type === "tool" && m.state === "running");
    live.emit({ toolCallCancellation: { ids: ["lent"] } });
    release();
    await c.waitFor((m) => m.type === "tool" && m.state === "done");
    await new Promise((r) => setTimeout(r, 50));
    expect(live.toolResponses).toEqual([]);
    c.ws.close();
    await c.closed;
  });

  it("répond TIMEOUT quand une consultation dépasse le délai", async () => {
    const g = await gateway({ runTool: () => new Promise(() => undefined), toolTimeoutMs: 100 });
    const before = sessions.length;
    const c = await connect(g.port, { cookie });
    await c.waitFor(isReady);
    const live = sessions[before]!;
    live.emit({ toolCall: { functionCalls: [{ id: "t1", name: "get_overview", args: {} }] } });
    await until(() => live.toolResponses.length === 1);
    expect(live.toolResponses[0]).toEqual([{ id: "t1", name: "get_overview", response: { error: "TIMEOUT", message: "La consultation a pris trop de temps" } }]);
    c.ws.close();
    await c.closed;
  });
});

describe("commandes de scène", () => {
  it("déclare aussi les outils « monde 3D »", async () => {
    const before = sessions.length;
    const c = await connect(port, { cookie });
    await c.waitFor(isReady);
    expect(sessions[before]!.options.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["show_object", "go_to_zone", "highlight", "get_scene"]));
    c.ws.close();
    await c.closed;
  });

  it("fait exécuter la commande par le navigateur et renvoie son résultat à Gemini", async () => {
    const before = sessions.length;
    const c = await connect(port, { cookie });
    await c.waitFor(isReady);
    const live = sessions[before]!;
    live.emit({ toolCall: { functionCalls: [{ id: "w1", name: "show_object", args: { target: "  Renault Master " } }] } });
    const call = await c.waitFor((m) => m.type === "world_call");
    // Arguments validés (et normalisés) par la passerelle avant d'atteindre le navigateur
    expect(call).toEqual({ type: "world_call", id: "w1", name: "show_object", args: { target: "Renault Master" } });
    c.ws.send(JSON.stringify({ type: "world_result", id: "w1", result: { ok: true, shown: { key: "VEHICLE:v1", label: "Renault Master" } } }));
    await until(() => live.toolResponses.length === 1);
    expect(live.toolResponses[0]).toEqual([{ id: "w1", name: "show_object", response: { output: { ok: true, shown: { key: "VEHICLE:v1", label: "Renault Master" } } } }]);
    // Pas d'indicateur « Eric consulte … » pour une commande de scène
    expect(c.messages.some((m) => m.type === "tool" && m.id === "w1")).toBe(false);
    c.ws.close();
    await c.closed;
  });

  it("rejette des arguments invalides sans solliciter le navigateur", async () => {
    const before = sessions.length;
    const c = await connect(port, { cookie });
    await c.waitFor(isReady);
    const live = sessions[before]!;
    live.emit({ toolCall: { functionCalls: [{ id: "w2", name: "go_to_zone", args: { zone: "PARKING" } }] } });
    await until(() => live.toolResponses.length === 1);
    expect(live.toolResponses[0]![0]!.response).toMatchObject({ error: "INVALID_ARGUMENTS" });
    expect(c.messages.some((m) => m.type === "world_call")).toBe(false);
    c.ws.close();
    await c.closed;
  });

  it("transmet l'échec du navigateur avec ses suggestions, sans laisser passer un code arbitraire", async () => {
    const before = sessions.length;
    const c = await connect(port, { cookie });
    await c.waitFor(isReady);
    const live = sessions[before]!;
    live.emit({ toolCall: { functionCalls: [{ id: "w3", name: "show_object", args: { target: "rayonnage" } }] } });
    await c.waitFor((m) => m.type === "world_call");
    c.ws.send(JSON.stringify({ type: "world_result", id: "w3", result: { ok: false, error: "AMBIGUOUS", message: "Plusieurs objets correspondent", suggestions: ["A-03", "A-01", 42] } }));
    await until(() => live.toolResponses.length === 1);
    expect(live.toolResponses[0]![0]!.response).toEqual({ error: "AMBIGUOUS", message: "Plusieurs objets correspondent Suggestions : A-03 ; A-01" });
    // Code inventé par le navigateur : ramené à FAILED
    live.emit({ toolCall: { functionCalls: [{ id: "w5", name: "get_scene", args: {} }] } });
    await c.waitFor((m) => m.type === "world_call" && m.id === "w5");
    c.ws.send(JSON.stringify({ type: "world_result", id: "w5", result: { ok: false, error: "ACCESS_GRANTED", message: "x" } }));
    await until(() => live.toolResponses.length === 2);
    expect(live.toolResponses[1]![0]!.response).toEqual({ error: "FAILED", message: "x" });
    c.ws.close();
    await c.closed;
  });

  it("répond UNAVAILABLE si le navigateur ne répond pas à temps", async () => {
    const g = await gateway({ worldTimeoutMs: 100 });
    const before = sessions.length;
    const c = await connect(g.port, { cookie });
    await c.waitFor(isReady);
    const live = sessions[before]!;
    live.emit({ toolCall: { functionCalls: [{ id: "w4", name: "get_scene", args: {} }] } });
    await until(() => live.toolResponses.length === 1);
    expect(live.toolResponses[0]![0]!.response).toEqual({ error: "UNAVAILABLE", message: "La scène 3D n'a pas répondu" });
    c.ws.close();
    await c.closed;
  });
});
