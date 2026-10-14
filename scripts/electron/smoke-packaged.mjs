/**
 * Test de fumée de l'application packagée (release/<version>/win-unpacked/EventFlow.exe), Windows :
 * démarrage en mode serveur local sur la base E2E, contrôle de santé, chargement du frontend,
 * fermeture normale puis arrêt forcé — sans processus ni port orphelin.
 *   node scripts/electron/smoke-packaged.mjs
 * Playwright ne peut pas piloter la version packagée (fusible EnableNodeCliInspectArguments désactivé).
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
// EVENTFLOW_EXE : tester une copie installée (ex. %LOCALAPPDATA%ProgramsventFlowventFlow.exe)
const exe = process.env.EVENTFLOW_EXE ?? path.join(root, "release", version, "win-unpacked", "EventFlow.exe");
const PORT = 41730;
const ORIGIN = `http://localhost:${PORT}`;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://eventflow:eventflow@localhost:5432/eventflow_e2e?schema=public";

if (process.platform !== "win32") throw new Error("Test réservé à Windows");
if (!fs.existsSync(exe)) throw new Error(`${exe} introuvable : exécuter npm run electron:pack`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(label, fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn().catch(() => false)) return;
    await sleep(500);
  }
  throw new Error(`Délai dépassé : ${label}`);
}
const portOpen = () => fetch(`${ORIGIN}/api/health`, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false);
const eventflowProcesses = () => execFileSync("tasklist", ["/FI", "IMAGENAME eq EventFlow.exe", "/FO", "CSV", "/NH"], { encoding: "utf8" }).split("\n").filter((l) => l.includes("EventFlow.exe")).length;

if (await portOpen()) throw new Error(`Le port ${PORT} est déjà utilisé`);
if (eventflowProcesses()) throw new Error("EventFlow.exe est déjà en cours d'exécution");

async function run(stop) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "eventflow-smoke-"));
  fs.writeFileSync(path.join(profile, "server.env"), `DATABASE_URL="${DATABASE_URL}"\nSTORAGE_DRIVER="local"\nMAIL_DRIVER="disabled"\n`);
  const started = Date.now();
  const child = spawn(exe, [], { env: { ...process.env, EVENTFLOW_USER_DATA_DIR: profile, EVENTFLOW_SERVER_MODE: "local", EVENTFLOW_QUIET: "1" }, stdio: "ignore" });
  const mainLog = path.join(profile, "logs", "main.log");
  try {
    await until("serveur local prêt (/api/health = 200)", async () => (await fetch(`${ORIGIN}/api/health`)).status === 200, 90_000);
    await until("frontend chargé dans la fenêtre", async () => fs.readFileSync(mainLog, "utf8").includes(`Chargement de ${ORIGIN}`), 30_000);
    const login = await fetch(`${ORIGIN}/login`);
    const html = await login.text();
    if (login.status !== 200 || !html.includes("Se connecter")) throw new Error("La page de connexion n'est pas servie");
    const glb = await fetch(`${ORIGIN}/models/truck.glb`);
    if (glb.status !== 200) throw new Error("Modèle 3D non servi");
    const log = fs.readFileSync(mainLog, "utf8");
    if (/Redirection refusée|Navigation refusée|\[error\]/.test(log)) throw new Error(`Erreurs dans main.log :\n${log}`);
    console.log(`  ✔ démarrage packagé, serveur prêt et frontend chargé en ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } finally {
    await stop(child);
    await until(`arrêt d'EventFlow.exe (${stop.name})`, async () => eventflowProcesses() === 0, 20_000);
    await until(`libération du port ${PORT} (${stop.name})`, async () => !(await portOpen()), 20_000);
    console.log(`  ✔ ${stop.name} : aucun processus EventFlow ni port ${PORT} restant`);
  }
}

/** Fermeture normale : WM_CLOSE sur la fenêtre (comme le bouton ×). */
async function fermetureNormale(child) {
  execFileSync("taskkill", ["/PID", String(child.pid)], { stdio: "ignore" });
}
/** Arrêt brutal du processus principal (plantage, gestionnaire des tâches). */
async function arretForce(child) {
  execFileSync("taskkill", ["/F", "/PID", String(child.pid)], { stdio: "ignore" });
}

console.log(`Test de fumée : ${path.relative(root, exe)}`);
await run(fermetureNormale);
await run(arretForce);
console.log("✔ Test de fumée réussi");
