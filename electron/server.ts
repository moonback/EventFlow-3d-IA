/**
 * Serveur Next.js embarqué (mode "local") : build standalone exécuté dans un `utilityProcess`
 * Electron (processus Node.js enfant, sans le fusible RunAsNode), à l'écoute de 127.0.0.1 uniquement.
 */
import { net, utilityProcess, type UtilityProcess } from "electron";
import fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { DEFAULT_LOCAL_PORT, paths } from "./config";
import { log, rotate } from "./logger";
import { localEncryptionKey } from "./secrets";
import { buildLocalServerEnv, classifyHealth, localServerOrigin, parseEnvFile, type AssistantConfig } from "./policy";

export class StartupError extends Error {
  constructor(
    public readonly title: string,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
  }
}

/** Vrai si le port est libre sur une adresse de bouclage. */
function isPortFreeOn(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", (e: NodeJS.ErrnoException) => resolve(host === "::1" && (e.code === "EADDRNOTAVAIL" || e.code === "EAFNOSUPPORT")));
    srv.listen({ port, host, exclusive: true }, () => srv.close(() => resolve(true)));
  });
}

/**
 * Libre en IPv4 **et** en IPv6 : l'origine est http://localhost:<port>, que Chromium peut résoudre en ::1 ;
 * aucun autre processus ne doit pouvoir répondre à la place du serveur EventFlow.
 */
async function isPortFree(port: number): Promise<boolean> {
  return (await isPortFreeOn(port, "127.0.0.1")) && (await isPortFreeOn(port, "::1"));
}

/** Port libre attribué par le système. */
function randomFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen({ port: 0, host: "127.0.0.1", exclusive: true }, () => {
      const addr = srv.address();
      srv.close(() => (addr && typeof addr === "object" ? resolve(addr.port) : reject(new Error("Port indisponible"))));
    });
  });
}

/** Port stable de préférence (stockage local du navigateur conservé), sinon un port libre. */
export async function choosePort(preferred = DEFAULT_LOCAL_PORT): Promise<number> {
  if (await isPortFree(preferred)) return preferred;
  log.warn(`Port ${preferred} occupé, choix d'un port libre`);
  for (let i = 0; i < 5; i++) {
    const port = await randomFreePort();
    if (await isPortFree(port)) return port;
  }
  throw new StartupError("Aucun port disponible", "Impossible de réserver un port local pour le serveur EventFlow.");
}

/**
 * Attend que GET /api/health réponde. 200 → prêt ; 503 → application démarrée mais base
 * inaccessible (erreur immédiate) ; erreur réseau → nouvel essai jusqu'au délai maximal.
 */
export async function waitForHealth(origin: string, opts: { timeoutMs: number; isAlive?: () => boolean; signal?: AbortSignal }): Promise<void> {
  const deadline = Date.now() + opts.timeoutMs;
  let lastError = "aucune réponse";
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new StartupError("Démarrage interrompu", "Le démarrage a été annulé.");
    if (opts.isAlive && !opts.isAlive()) throw new StartupError("Le serveur local s'est arrêté", "Le serveur EventFlow s'est arrêté pendant son démarrage.", "Consultez server.log dans le dossier des journaux.");
    try {
      const res = await net.fetch(`${origin}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      const kind = classifyHealth(res.status);
      if (kind === "ready") return;
      if (kind === "database")
        throw new StartupError("Base de données inaccessible", "Le serveur EventFlow répond mais ne parvient pas à joindre la base de données PostgreSQL.", "Vérifiez que PostgreSQL est démarré et que DATABASE_URL est correcte.");
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      if (error instanceof StartupError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new StartupError("Serveur injoignable", `Le serveur EventFlow (${origin}) ne répond pas.`, `Dernière erreur : ${lastError}`);
}

export interface LocalServerHandle {
  origin: string;
  /** URL WebSocket de la passerelle vocale si l'assistant est actif, sinon null (exposée au renderer). */
  readonly assistantWsUrl: string | null;
  stop(): Promise<void>;
  readonly alive: boolean;
}

/** Démarre le serveur local, attend son contrôle de santé et renvoie son origine. */
export async function startLocalServer(opts: { preferredPort?: number; onExit?: (code: number) => void }): Promise<LocalServerHandle> {
  const serverDir = paths.server();
  const entry = path.join(serverDir, "server.js");
  if (!fs.existsSync(entry)) throw new StartupError("Serveur local absent", "Le serveur EventFlow embarqué est introuvable.", `Fichier attendu : ${entry} (exécuter npm run electron:build).`);

  const envFile = paths.serverEnvFile();
  if (!fs.existsSync(envFile))
    throw new StartupError("Configuration du serveur local manquante", "Le mode serveur local nécessite un fichier server.env (au minimum DATABASE_URL).", `Emplacement attendu : ${envFile}`);
  let userEnv: Record<string, string>;
  try {
    userEnv = parseEnvFile(fs.readFileSync(envFile, "utf8"));
  } catch (error) {
    throw new StartupError("server.env illisible", "Le fichier de configuration du serveur local n'a pas pu être lu.", error instanceof Error ? error.message : undefined);
  }

  const port = await choosePort(opts.preferredPort);
  fs.mkdirSync(paths.serverData(), { recursive: true });
  const built = buildLocalServerEnv(userEnv, { port, dataDir: paths.serverData(), systemEnv: process.env, encryptionKey: localEncryptionKey() });
  if (built.error || !built.env) throw new StartupError("Configuration du serveur local incomplète", built.error ?? "Configuration invalide", `Fichier : ${envFile}`);
  for (const w of built.warnings) log.warn(`[server] ${w}`);

  const logFile = path.join(paths.logs(), "server.log");
  rotate(logFile);
  const out = fs.createWriteStream(logFile, { flags: "a" });
  out.write(`\n[${new Date().toISOString()}] Démarrage du serveur local sur 127.0.0.1:${port}\n`);

  const child: UtilityProcess = utilityProcess.fork(entry, [], {
    cwd: serverDir,
    env: built.env,
    stdio: "pipe",
    serviceName: "EventFlow Server",
  });
  let alive = true;
  let exitResolve: (() => void) | null = null;
  const exited = new Promise<void>((r) => (exitResolve = r));
  child.stdout?.on("data", (d: Buffer) => {
    out.write(d);
    if (!process.env.EVENTFLOW_QUIET) process.stdout.write(`[server] ${d}`);
  });
  child.stderr?.on("data", (d: Buffer) => {
    out.write(d);
    process.stderr.write(`[server] ${d}`);
  });
  child.on("exit", (code) => {
    alive = false;
    out.write(`[${new Date().toISOString()}] Arrêt du serveur local (code ${code})\n`);
    out.end();
    log.info(`Serveur local arrêté (code ${code})`);
    exitResolve?.();
    opts.onExit?.(code);
  });

  // Passerelle vocale : démarrée après le serveur, arrêtée avec lui (cycle de vie commun).
  const assistant: AssistantConfig | null = built.assistant ?? null;
  let gateway: AssistantGatewayHandle | null = null;

  const handle: LocalServerHandle = {
    origin: localServerOrigin(port),
    get assistantWsUrl() {
      return gateway?.alive ? (assistant?.wsUrl ?? null) : null;
    },
    get alive() {
      return alive;
    },
    async stop() {
      await gateway?.stop();
      if (!alive) return;
      child.kill();
      // Le processus utilitaire est terminé par le système ; attente bornée de l'événement de sortie
      await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    },
  };

  try {
    await waitForHealth(handle.origin, { timeoutMs: 90_000, isAlive: () => alive });
  } catch (error) {
    await handle.stop();
    throw error;
  }
  // L'assistant est optionnel : son échec ne compromet pas le serveur ni le démarrage de l'application.
  // Port de la passerelle déterministe (serveur + 1) : refusé s'il est déjà pris, pour qu'aucun autre
  // processus ne reçoive la voix ni le cookie de session envoyés à localhost.
  if (assistant) {
    if (await isPortFree(assistant.port)) gateway = startAssistantGateway({ env: assistant.env });
    else log.warn(`[assistant] port ${assistant.port} déjà utilisé : assistant vocal indisponible`);
  }
  log.info(`Serveur local prêt sur ${handle.origin}`);
  return handle;
}

export interface AssistantGatewayHandle {
  stop(): Promise<void>;
  readonly alive: boolean;
}

/**
 * Démarre la passerelle WebSocket de l'assistant vocal Eric dans un `utilityProcess` séparé (le
 * serveur Next.js embarqué ne gère pas l'upgrade WebSocket). Le bundle `assistant-gateway.js` est
 * produit à côté de `server.js` dans desktop-server ; en cas d'absence (assistant non embarqué) ou
 * d'erreur, l'assistant reste simplement indisponible — jamais de blocage du démarrage.
 */
export function startAssistantGateway(opts: { env: Record<string, string>; onExit?: (code: number) => void }): AssistantGatewayHandle | null {
  const serverDir = paths.server();
  const entry = path.join(serverDir, "assistant-gateway.js");
  if (!fs.existsSync(entry)) {
    log.warn(`[assistant] passerelle introuvable (${entry}) : assistant vocal indisponible`);
    return null;
  }

  const logFile = path.join(paths.logs(), "assistant.log");
  rotate(logFile);
  const out = fs.createWriteStream(logFile, { flags: "a" });
  out.write(`\n[${new Date().toISOString()}] Démarrage de la passerelle vocale sur 127.0.0.1:${opts.env.ASSISTANT_GATEWAY_PORT ?? "?"}\n`);

  const child: UtilityProcess = utilityProcess.fork(entry, [], {
    cwd: serverDir,
    env: opts.env,
    stdio: "pipe",
    serviceName: "EventFlow Assistant",
  });
  let alive = true;
  let exitResolve: (() => void) | null = null;
  const exited = new Promise<void>((r) => (exitResolve = r));
  child.stdout?.on("data", (d: Buffer) => {
    out.write(d);
    if (!process.env.EVENTFLOW_QUIET) process.stdout.write(`[assistant] ${d}`);
  });
  child.stderr?.on("data", (d: Buffer) => {
    out.write(d);
    process.stderr.write(`[assistant] ${d}`);
  });
  child.on("exit", (code) => {
    alive = false;
    out.write(`[${new Date().toISOString()}] Arrêt de la passerelle vocale (code ${code})\n`);
    out.end();
    log.info(`Passerelle vocale arrêtée (code ${code})`);
    exitResolve?.();
    opts.onExit?.(code);
  });

  log.info(`Passerelle vocale démarrée (port ${opts.env.ASSISTANT_GATEWAY_PORT ?? "?"})`);
  return {
    get alive() {
      return alive;
    },
    async stop() {
      if (!alive) return;
      child.kill();
      await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    },
  };
}
