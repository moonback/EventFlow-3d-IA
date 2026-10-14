import "server-only";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import type { FunctionCall, FunctionDeclaration, LiveServerMessage } from "@google/genai";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { buildSystemInstruction } from "@/features/assistant/persona";
import { findWorldTool, isWorldErrorCode, worldToolDeclarations, type WorldResult } from "@/features/assistant/world-tools";
import { ASSISTANT_WS_PATH, CLOSE_CODES, MAX_AUDIO_FRAME_BYTES, parseClientMessage, type AssistantErrorCode, type ServerMessage } from "@/features/assistant/protocol";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "../audit";
import { can, type AuthContext } from "../auth/context";
import { resolveSessionToken, sessionTokenFromCookieHeader } from "../auth/session-token";
import { actionToolDeclarations, findActionTool } from "./action-tools";
import { assistantOrgSettings, type AssistantOrgSettings } from "./availability";
import { dataToolDeclarations, findDataTool, runDataTool, toolError, type ToolOutcome } from "./data-tools";
import type { LiveConnector, LiveSessionLike, ToolResponse } from "./live-session";

export interface GatewayOptions {
  connector: LiveConnector;
  /** 0 : port libre choisi par le système (tests) */
  port?: number;
  host?: string;
  /** Origines autorisées pour l'upgrade (défaut : origine de APP_URL) */
  allowedOrigins?: string[];
  enabled?: boolean;
  idleMs?: number;
  maxDurationMs?: number;
  /** Fréquence de revalidation de la session EventFlow pendant la conversation */
  revalidateMs?: number;
  resolveSession?: (token: string) => Promise<AuthContext | null>;
  /** Réglages de l'organisation (activation, voix, durée) — défaut : lus en base */
  orgSettings?: (organizationId: string) => Promise<AssistantOrgSettings>;
  /** Outils déclarés au modèle et leur exécution (défaut : outils « données ») */
  tools?: FunctionDeclaration[];
  runTool?: (ctx: AuthContext, name: string, args: unknown) => Promise<ToolOutcome>;
  toolTimeoutMs?: number;
  /** Délai de réponse du navigateur à une commande de scène */
  worldTimeoutMs?: number;
  /** Délai laissé à l'utilisateur pour confirmer une action */
  confirmTimeoutMs?: number;
  log?: (event: string, data?: Record<string, unknown>) => void;
}

export interface AssistantGateway {
  port: number;
  close(): Promise<void>;
}

const STATUS_TEXT: Record<number, string> = { 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 503: "Service Unavailable" };
/** Nombre de reconnexions Live consécutives tolérées (goAway, coupure réseau) */
const MAX_LIVE_RECONNECTS = 3;
/** Appels d'outils exécutés par message `toolCall` (les suivants sont refusés) */
const MAX_PARALLEL_TOOLS = 8;
/** Demandes de confirmation simultanées au plus */
const MAX_PENDING_CONFIRMS = 3;

type ConfirmDecision = "approved" | "rejected" | "expired" | "withdrawn";

function reject(socket: Duplex, status: number) {
  socket.write(`HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? "Error"}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/**
 * Passerelle WebSocket de l'assistant vocal : une connexion navigateur ↔ une session Gemini Live.
 * Processus Node séparé de Next.js (l'App Router ne gère pas l'upgrade WebSocket) : l'utilisateur
 * est authentifié par le cookie de session EventFlow, les identifiants Google ne quittent pas le serveur.
 */
export async function startAssistantGateway(options: GatewayOptions): Promise<AssistantGateway> {
  const e = env();
  const opts = {
    port: options.port ?? e.ASSISTANT_GATEWAY_PORT,
    host: options.host,
    allowedOrigins: new Set(options.allowedOrigins ?? [new URL(e.APP_URL).origin]),
    enabled: options.enabled ?? e.ASSISTANT_ENABLED === "true",
    idleMs: options.idleMs ?? e.ASSISTANT_IDLE_SECONDS * 1000,
    maxDurationMs: options.maxDurationMs ?? e.ASSISTANT_MAX_SESSION_MINUTES * 60_000,
    revalidateMs: options.revalidateMs ?? 60_000,
    resolveSession: options.resolveSession ?? resolveSessionToken,
    orgSettings: options.orgSettings ?? assistantOrgSettings,
    tools: options.tools ?? [...dataToolDeclarations(), ...worldToolDeclarations(), ...actionToolDeclarations()],
    runTool: options.runTool ?? runDataTool,
    toolTimeoutMs: options.toolTimeoutMs ?? 10_000,
    worldTimeoutMs: options.worldTimeoutMs ?? 5_000,
    confirmTimeoutMs: options.confirmTimeoutMs ?? 60_000,
    log: options.log ?? ((event: string, data?: Record<string, unknown>) => console.info(`[assistant] ${event}`, data ?? {})),
    connector: options.connector,
  };

  const active = new Map<string, AssistantConnection>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  const server: Server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, enabled: opts.enabled, sessions: active.size }));
      return;
    }
    res.writeHead(404).end();
  });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    void (async () => {
      const path = new URL(req.url ?? "/", "http://gateway").pathname;
      if (path !== ASSISTANT_WS_PATH) return reject(socket, 404);
      // Protection contre le détournement de WebSocket inter-sites : l'origine doit être l'application
      const origin = req.headers.origin;
      if (!origin || !opts.allowedOrigins.has(origin)) return reject(socket, 403);
      if (!opts.enabled) return reject(socket, 503);
      const token = sessionTokenFromCookieHeader(req.headers.cookie);
      const ctx = token ? await opts.resolveSession(token) : null;
      if (!token || !ctx) return reject(socket, 401);
      if (!can(ctx, "assistant:use")) return reject(socket, 403);
      // Assistant désactivé par l'organisation (Paramètres → Organisation)
      const org = await opts.orgSettings(ctx.organizationId);
      if (!org.orgEnabled) return reject(socket, 403);

      wss.handleUpgrade(req, socket, head, (ws) => {
        // Une seule conversation par utilisateur : la nouvelle (autre onglet, rechargement) remplace l'ancienne
        active.get(ctx.userId)?.terminate("REPLACED", CLOSE_CODES.REPLACED, "Conversation ouverte ailleurs");
        const conn = new AssistantConnection(ws, ctx, token, opts, org, () => {
          if (active.get(ctx.userId) === conn) active.delete(ctx.userId);
        });
        active.set(ctx.userId, conn);
        void conn.start();
      });
    })().catch((error: unknown) => {
      opts.log("upgrade_error", { message: error instanceof Error ? error.message : String(error) });
      reject(socket, 503);
    });
  });

  await new Promise<void>((resolve) => server.listen(opts.port, opts.host, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : opts.port;
  opts.log("listening", { port, enabled: opts.enabled });

  return {
    port,
    close: async () => {
      for (const conn of active.values()) conn.terminate(null, 1001, "Arrêt du serveur");
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

type ResolvedOptions = {
  idleMs: number;
  maxDurationMs: number;
  revalidateMs: number;
  resolveSession: (token: string) => Promise<AuthContext | null>;
  orgSettings: (organizationId: string) => Promise<AssistantOrgSettings>;
  tools: FunctionDeclaration[];
  runTool: (ctx: AuthContext, name: string, args: unknown) => Promise<ToolOutcome>;
  toolTimeoutMs: number;
  worldTimeoutMs: number;
  confirmTimeoutMs: number;
  log: (event: string, data?: Record<string, unknown>) => void;
  connector: LiveConnector;
};

/** Une conversation : relais navigateur ↔ Gemini Live, minuteries et reprise de session. */
class AssistantConnection {
  private live: LiveSessionLike | null = null;
  /** Incrémenté à chaque (re)connexion Live : les rappels d'une session remplacée sont ignorés */
  private generation = 0;
  private resumeHandle: string | undefined;
  private reconnects = 0;
  private closed = false;
  private lastActivity = Date.now();
  private readonly startedAt = Date.now();
  private readonly pendingTexts: string[] = [];
  /** Appels d'outils annulés par le modèle (l'utilisateur a repris la parole) */
  private readonly cancelledCalls = new Set<string>();
  /** Commandes de scène en attente de `world_result` */
  private readonly pendingWorld = new Map<string, (result: WorldResult) => void>();
  /** Actions en attente du clic de l'utilisateur */
  private readonly pendingConfirms = new Map<string, (decision: ConfirmDecision) => void>();
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly ws: WebSocket,
    private readonly ctx: AuthContext,
    private readonly token: string,
    private readonly opts: ResolvedOptions,
    private readonly org: AssistantOrgSettings,
    private readonly onEnd: () => void,
  ) {
    ws.on("message", (data, isBinary) => this.onClientMessage(data, isBinary));
    ws.on("close", () => this.cleanup());
    ws.on("error", () => this.cleanup());
  }

  async start() {
    this.send({ type: "state", state: "connecting" });
    this.opts.log("session_start", { userId: this.ctx.userId, organizationId: this.ctx.organizationId });
    this.timers.push(
      setInterval(() => {
        if (Date.now() - this.lastActivity > this.opts.idleMs) this.terminate("IDLE_TIMEOUT", CLOSE_CODES.IDLE_TIMEOUT, "Conversation fermée après une période d'inactivité");
      }, Math.min(5_000, this.opts.idleMs)),
      setTimeout(() => this.terminate("MAX_DURATION", CLOSE_CODES.MAX_DURATION, "Durée maximale de conversation atteinte"), this.maxDurationMs()),
      setInterval(() => void this.revalidate(), this.opts.revalidateMs),
    );
    await this.connectLive();
  }

  /** Durée maximale : celle choisie par l'organisation, jamais au-delà de la limite du serveur. */
  private maxDurationMs() {
    const orgMs = this.org.maxSessionMinutes ? this.org.maxSessionMinutes * 60_000 : Infinity;
    return Math.min(this.opts.maxDurationMs, orgMs);
  }

  /** Fermeture de la conversation, avec un message d'erreur explicite si `code` est fourni. */
  terminate(code: AssistantErrorCode | null, closeCode: number, message: string) {
    if (this.closed) return;
    if (code) this.send({ type: "error", code, message });
    this.ws.close(closeCode, message.slice(0, 120));
    this.cleanup();
  }

  private async connectLive() {
    const generation = ++this.generation;
    const isCurrent = () => generation === this.generation && !this.closed;
    try {
      const session = await this.opts.connector({
        systemInstruction: buildSystemInstruction({
          organizationName: this.ctx.organization.name,
          userName: this.ctx.user.name,
          role: this.ctx.role,
          timezone: this.ctx.organization.timezone,
          currency: this.ctx.organization.currency,
          now: new Date(),
        }),
        resumeHandle: this.resumeHandle,
        voice: this.org.voice,
        tools: this.opts.tools,
        events: {
          onMessage: (m) => {
            if (isCurrent()) this.onLiveMessage(m);
          },
          onError: (message) => {
            if (isCurrent()) this.opts.log("live_error", { userId: this.ctx.userId, message });
          },
          onClose: (reason) => {
            if (isCurrent()) this.onLiveClosed(reason);
          },
        },
      });
      if (!isCurrent()) return session.close();
      this.live = session;
      this.reconnects = 0;
      this.send({ type: "state", state: "ready" });
      for (const text of this.pendingTexts.splice(0)) session.sendText(text);
    } catch (error) {
      if (!isCurrent()) return;
      this.opts.log("live_connect_failed", { userId: this.ctx.userId, message: error instanceof Error ? error.message : String(error) });
      this.terminate("LIVE_UNAVAILABLE", CLOSE_CODES.LIVE_UNAVAILABLE, "Eric est momentanément indisponible");
    }
  }

  /** Reprise transparente (goAway, coupure) : le navigateur ne voit qu'un bref état « connecting ». */
  private reconnectLive(reason: string) {
    if (this.closed) return;
    if (!this.resumeHandle || this.reconnects >= MAX_LIVE_RECONNECTS) {
      this.opts.log("live_lost", { userId: this.ctx.userId, reason });
      return this.terminate("LIVE_UNAVAILABLE", CLOSE_CODES.LIVE_UNAVAILABLE, "La connexion avec Eric a été perdue");
    }
    this.reconnects++;
    this.opts.log("live_resume", { userId: this.ctx.userId, reason, attempt: this.reconnects });
    const old = this.live;
    this.live = null;
    this.generation++; // les rappels de l'ancienne session sont désormais ignorés
    // La nouvelle session n'attend plus les réponses en cours : les propositions d'action sont retirées
    for (const settle of [...this.pendingConfirms.values()]) settle("withdrawn");
    old?.close();
    this.send({ type: "state", state: "connecting" });
    void this.connectLive();
  }

  private onLiveClosed(reason: string) {
    this.live = null;
    this.reconnectLive(reason);
  }

  private onLiveMessage(m: LiveServerMessage) {
    const content = m.serverContent;
    if (content) {
      for (const part of content.modelTurn?.parts ?? []) {
        const data = part.inlineData?.data;
        if (data && part.inlineData?.mimeType?.startsWith("audio/pcm")) {
          this.ws.send(Buffer.from(data, "base64"), { binary: true });
          this.lastActivity = Date.now();
        }
      }
      if (content.inputTranscription?.text) {
        this.send({ type: "transcript", role: "user", text: content.inputTranscription.text });
        this.lastActivity = Date.now();
      }
      if (content.outputTranscription?.text) this.send({ type: "transcript", role: "eric", text: content.outputTranscription.text });
      if (content.interrupted) this.send({ type: "interrupted" });
      if (content.turnComplete) this.send({ type: "turn_complete" });
    }
    if (m.toolCall?.functionCalls?.length) void this.runToolCalls(m.toolCall.functionCalls);
    for (const id of m.toolCallCancellation?.ids ?? []) {
      this.cancelledCalls.add(id);
      this.pendingConfirms.get(id)?.("withdrawn");
    }
    const update = m.sessionResumptionUpdate;
    if (update?.resumable && update.newHandle) this.resumeHandle = update.newHandle;
    if (m.goAway) this.reconnectLive("goAway");
  }

  /** Exécute les appels d'outils en parallèle puis renvoie toutes les réponses à Gemini. */
  private async runToolCalls(calls: FunctionCall[]) {
    const generation = this.generation;
    this.lastActivity = Date.now();
    const responses = await Promise.all(calls.map((call, index) => this.runToolCall(call, index < MAX_PARALLEL_TOOLS)));
    // Session Live remplacée entre-temps (reprise) : l'appel n'est plus attendu
    if (this.closed || generation !== this.generation || !this.live) return;
    const pending = responses.filter((r) => !this.cancelledCalls.has(r.id));
    for (const r of responses) this.cancelledCalls.delete(r.id);
    if (pending.length) this.live.sendToolResponses(pending);
  }

  private async runToolCall(call: FunctionCall, allowed: boolean): Promise<ToolResponse> {
    const id = call.id ?? "";
    const name = call.name ?? "";
    const world = findWorldTool(name);
    const action = findActionTool(name);
    const label = findDataTool(name)?.label ?? name;
    const started = Date.now();
    // Scène (visible dans la 3D) et actions (carte de confirmation) : pas d'indicateur « Eric consulte … »
    const indicator = !world && !action;
    if (indicator) this.send({ type: "tool", id, label, state: "running" });
    let outcome: ToolOutcome;
    if (!allowed) outcome = { ok: false, error: "TOO_MANY_CALLS", message: `${MAX_PARALLEL_TOOLS} consultations au plus à la fois` };
    else if (world) outcome = await this.runWorldTool(id, name, call.args ?? {});
    else if (action) outcome = await this.runActionTool(id, name, call.args ?? {});
    else {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<ToolOutcome>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, error: "TIMEOUT", message: "La consultation a pris trop de temps" }), this.opts.toolTimeoutMs);
      });
      outcome = await Promise.race([this.opts.runTool(this.ctx, name, call.args ?? {}), timeout]).finally(() => clearTimeout(timer));
    }
    const durationMs = Date.now() - started;
    if (indicator) this.send({ type: "tool", id, label, state: outcome.ok ? "done" : "error" });
    this.opts.log("tool", { userId: this.ctx.userId, tool: name, ok: outcome.ok, error: outcome.ok ? undefined : outcome.error, durationMs });
    await db.assistantToolCall
      .create({ data: { organizationId: this.ctx.organizationId, userId: this.ctx.userId, tool: name.slice(0, 64), ok: outcome.ok, errorCode: outcome.ok ? null : outcome.error, durationMs } })
      .catch((error: unknown) => this.opts.log("tool_log_failed", { message: error instanceof Error ? error.message : String(error) }));
    return { id, name, response: outcome.ok ? { output: outcome.output } : { error: outcome.error, message: outcome.message } };
  }

  /**
   * Action : droits et arguments vérifiés, aperçu construit depuis la base, puis attente du clic.
   * Rien n'est exécuté sans « approved » ; une demande retirée par le modèle, interrompue par une
   * reprise de session ou expirée n'exécute jamais rien, même si un clic arrive ensuite.
   */
  private async runActionTool(id: string, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
    const tool = findActionTool(name)!;
    const forbidden: ToolOutcome = { ok: false, error: "FORBIDDEN", message: "L'interlocuteur n'a pas les droits pour cette opération" };
    if (tool.permissions.some((p) => !can(this.ctx, p))) return forbidden;
    const parsed = tool.input.safeParse(args);
    if (!parsed.success) return { ok: false, error: "INVALID_ARGUMENTS", message: parsed.error.issues.map((i) => `${i.path.join(".") || "arguments"} : ${i.message}`).join(" ; ") };
    let preview;
    try {
      preview = await tool.prepare(this.ctx, parsed.data);
    } catch (error) {
      return toolError(name, error);
    }
    // Contrôlé après `prepare` (asynchrone) et juste avant l'enregistrement : sans course possible
    if (this.pendingConfirms.size >= MAX_PENDING_CONFIRMS) return { ok: false, error: "TOO_MANY_PENDING", message: "Des actions attendent déjà une confirmation" };
    const confirmId = id || `a${Date.now()}`;
    const decision = await new Promise<ConfirmDecision>((resolve) => {
      const settle = (d: ConfirmDecision) => {
        clearTimeout(timer);
        this.pendingConfirms.delete(confirmId);
        resolve(d);
      };
      const timer = setTimeout(() => settle("expired"), this.opts.confirmTimeoutMs);
      this.pendingConfirms.set(confirmId, settle);
      this.send({ type: "confirm_request", id: confirmId, title: preview.title, details: preview.details, danger: Boolean(preview.danger), expiresInSec: Math.round(this.opts.confirmTimeoutMs / 1000) });
    });
    const close = (outcome: "done" | "cancelled" | "expired" | "withdrawn" | "failed", message: string) => this.send({ type: "confirm_closed", id: confirmId, outcome, message });
    if (decision === "expired") {
      close("expired", "Délai de confirmation dépassé : rien n'a été modifié");
      return { ok: true, output: { status: "expired", message: "L'utilisateur n'a pas confirmé à temps : rien n'a été modifié" } };
    }
    if (decision === "withdrawn" || this.cancelledCalls.has(id)) {
      close("withdrawn", "Proposition retirée : rien n'a été modifié");
      return { ok: true, output: { status: "withdrawn" } };
    }
    if (decision === "rejected") {
      close("cancelled", "Refusé : rien n'a été modifié");
      return { ok: true, output: { status: "cancelled_by_user", message: "L'utilisateur a refusé : rien n'a été modifié" } };
    }
    // Droits relus au moment d'exécuter (session révoquée ou permission retirée pendant l'attente)
    const fresh = await this.opts.resolveSession(this.token).catch(() => null);
    if (!fresh || fresh.userId !== this.ctx.userId || !can(fresh, "assistant:use") || tool.permissions.some((p) => !can(fresh, p))) {
      close("failed", "Droits insuffisants : rien n'a été modifié");
      return forbidden;
    }
    try {
      const result = await tool.execute(fresh, parsed.data);
      await audit(fresh, "assistant.action", "Assistant", null, { tool: name });
      close("done", "C'est fait");
      // Résultat dans son propre champ : il ne doit jamais masquer le statut « done »
      return { ok: true, output: { status: "done", result } };
    } catch (error) {
      const outcome = toolError(name, error);
      close("failed", outcome.message);
      return outcome;
    }
  }

  /** Commande de scène : arguments validés ici, exécution par le navigateur, résultat attendu 5 s au plus. */
  private async runWorldTool(id: string, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
    const parsed = findWorldTool(name)!.input.safeParse(args);
    if (!parsed.success) return { ok: false, error: "INVALID_ARGUMENTS", message: parsed.error.issues.map((i) => `${i.path.join(".") || "arguments"} : ${i.message}`).join(" ; ") };
    const callId = id || `w${Date.now()}`;
    const result = await new Promise<WorldResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingWorld.delete(callId);
        resolve({ ok: false, error: "UNAVAILABLE", message: "La scène 3D n'a pas répondu" });
      }, this.opts.worldTimeoutMs);
      this.pendingWorld.set(callId, (r) => {
        clearTimeout(timer);
        this.pendingWorld.delete(callId);
        resolve(r);
      });
      this.send({ type: "world_call", id: callId, name, args: parsed.data as Record<string, unknown> });
    });
    if (result.ok) return { ok: true, output: result };
    const suggestions = result.suggestions?.length ? ` Suggestions : ${result.suggestions.join(" ; ")}` : "";
    return { ok: false, error: result.error, message: `${result.message}${suggestions}` };
  }

  private onClientMessage(data: RawData, isBinary: boolean) {
    if (this.closed) return;
    if (isBinary) {
      const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
      // PCM 16 bits : longueur paire ; les trames hors gabarit sont ignorées
      if (buf.length === 0 || buf.length > MAX_AUDIO_FRAME_BYTES || buf.length % 2 !== 0) return;
      this.live?.sendAudio(buf); // audio reçu pendant une (re)connexion : ignoré (temps réel)
      return;
    }
    const message = parseClientMessage(data.toString());
    if (!message) return this.send({ type: "error", code: "BAD_MESSAGE", message: "Message non reconnu" });
    this.lastActivity = Date.now();
    switch (message.type) {
      case "text":
        if (this.live) this.live.sendText(message.text);
        else if (this.pendingTexts.length < 5) this.pendingTexts.push(message.text);
        break;
      case "audio_end":
        this.live?.sendAudioEnd();
        break;
      case "hangup":
        this.terminate(null, CLOSE_CODES.HANGUP, "Conversation terminée");
        break;
      case "confirm_answer":
        this.pendingConfirms.get(message.id)?.(message.approved ? "approved" : "rejected");
        break;
      case "world_result": {
        const r = message.result;
        // Forme minimale contrôlée : le navigateur ne peut pas faire passer n'importe quoi pour un succès
        const result: WorldResult =
          r.ok === true
            ? { ...r, ok: true }
            : { ok: false, error: isWorldErrorCode(r.error) ? r.error : "FAILED", message: typeof r.message === "string" ? r.message : "Commande de scène impossible", suggestions: Array.isArray(r.suggestions) ? r.suggestions.filter((x): x is string => typeof x === "string").slice(0, 6) : undefined };
        this.pendingWorld.get(message.id)?.(result);
        break;
      }
    }
  }

  /** La session EventFlow peut être révoquée ou la permission retirée pendant la conversation. */
  private async revalidate() {
    if (this.closed) return;
    const ctx = await this.opts.resolveSession(this.token).catch(() => null);
    if (!ctx || ctx.userId !== this.ctx.userId || !can(ctx, "assistant:use")) {
      this.terminate("SESSION_EXPIRED", CLOSE_CODES.SESSION_EXPIRED, "Votre session a expiré, reconnectez-vous");
      return;
    }
    // L'assistant peut être désactivé dans les paramètres pendant la conversation
    const org = await this.opts.orgSettings(ctx.organizationId).catch(() => null);
    if (!this.closed && org && !org.orgEnabled) this.terminate("DISABLED", CLOSE_CODES.DISABLED, "L'assistant Eric a été désactivé pour votre organisation");
  }

  private send(message: ServerMessage) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(message));
  }

  private cleanup() {
    if (this.closed) return;
    this.closed = true;
    this.generation++;
    for (const t of this.timers) clearTimeout(t);
    for (const resolve of [...this.pendingWorld.values()]) resolve({ ok: false, error: "UNAVAILABLE", message: "Conversation terminée" });
    for (const settle of [...this.pendingConfirms.values()]) settle("withdrawn");
    this.live?.close();
    this.live = null;
    this.onEnd();
    this.opts.log("session_end", { userId: this.ctx.userId, durationSec: Math.round((Date.now() - this.startedAt) / 1000) });
  }
}
