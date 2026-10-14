import "server-only";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import type { LiveServerMessage } from "@google/genai";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { buildSystemInstruction } from "@/features/assistant/persona";
import { ASSISTANT_WS_PATH, CLOSE_CODES, MAX_AUDIO_FRAME_BYTES, parseClientMessage, type AssistantErrorCode, type ServerMessage } from "@/features/assistant/protocol";
import { env } from "@/lib/env";
import { can, type AuthContext } from "../auth/context";
import { resolveSessionToken, sessionTokenFromCookieHeader } from "../auth/session-token";
import type { LiveConnector, LiveSessionLike } from "./live-session";

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
  log?: (event: string, data?: Record<string, unknown>) => void;
}

export interface AssistantGateway {
  port: number;
  close(): Promise<void>;
}

const STATUS_TEXT: Record<number, string> = { 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 503: "Service Unavailable" };
/** Nombre de reconnexions Live consécutives tolérées (goAway, coupure réseau) */
const MAX_LIVE_RECONNECTS = 3;

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

      wss.handleUpgrade(req, socket, head, (ws) => {
        // Une seule conversation par utilisateur : la nouvelle (autre onglet, rechargement) remplace l'ancienne
        active.get(ctx.userId)?.terminate("REPLACED", CLOSE_CODES.REPLACED, "Conversation ouverte ailleurs");
        const conn = new AssistantConnection(ws, ctx, token, opts, () => {
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
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly ws: WebSocket,
    private readonly ctx: AuthContext,
    private readonly token: string,
    private readonly opts: ResolvedOptions,
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
      setTimeout(() => this.terminate("MAX_DURATION", CLOSE_CODES.MAX_DURATION, "Durée maximale de conversation atteinte"), this.opts.maxDurationMs),
      setInterval(() => void this.revalidate(), this.opts.revalidateMs),
    );
    await this.connectLive();
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
          now: new Date(),
        }),
        resumeHandle: this.resumeHandle,
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
    const update = m.sessionResumptionUpdate;
    if (update?.resumable && update.newHandle) this.resumeHandle = update.newHandle;
    if (m.goAway) this.reconnectLive("goAway");
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
    }
  }

  /** La session EventFlow peut être révoquée ou la permission retirée pendant la conversation. */
  private async revalidate() {
    if (this.closed) return;
    const ctx = await this.opts.resolveSession(this.token).catch(() => null);
    if (!ctx || ctx.userId !== this.ctx.userId || !can(ctx, "assistant:use")) {
      this.terminate("SESSION_EXPIRED", CLOSE_CODES.SESSION_EXPIRED, "Votre session a expiré, reconnectez-vous");
    }
  }

  private send(message: ServerMessage) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(message));
  }

  private cleanup() {
    if (this.closed) return;
    this.closed = true;
    this.generation++;
    for (const t of this.timers) clearTimeout(t);
    this.live?.close();
    this.live = null;
    this.onEnd();
    this.opts.log("session_end", { userId: this.ctx.userId, durationSec: Math.round((Date.now() - this.startedAt) / 1000) });
  }
}
