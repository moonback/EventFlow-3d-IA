/**
 * Build de l'application de bureau.
 *   node scripts/electron/build.mjs                  → processus Electron + serveur Next.js standalone
 *   node scripts/electron/build.mjs --electron-only  → processus Electron seulement (développement)
 *
 * Variables (facultatives, sans secret) :
 *   EVENTFLOW_SERVER_URL    serveur distant proposé par défaut (https://…)
 *   EVENTFLOW_DEFAULT_MODE  "remote" ou "local"
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const electronOnly = process.argv.includes("--electron-only");
const outDir = path.join(root, "dist-electron");
const distDir = ".next-desktop";
const serverOut = path.join(root, "build", "desktop-server");

function step(label) {
  console.log(`\n▶ ${label}`);
}

async function buildElectron() {
  step("Compilation du processus principal, du preload et des pages internes");
  fs.rmSync(outDir, { recursive: true, force: true });
  const common = { bundle: true, sourcemap: false, logLevel: "warning", legalComments: "none", define: { "process.env.NODE_ENV": '"production"' } };
  await build({ ...common, entryPoints: [path.join(root, "electron/main.ts")], outfile: path.join(outDir, "main.js"), platform: "node", format: "cjs", target: "node22", external: ["electron"] });
  // Preload sandboxé : un seul fichier, seul le module "electron" est disponible
  await build({ ...common, entryPoints: [path.join(root, "electron/preload.ts")], outfile: path.join(outDir, "preload.js"), platform: "node", format: "cjs", target: "node22", external: ["electron"] });
  await build({ ...common, entryPoints: [path.join(root, "electron/pages/pages.ts")], outfile: path.join(outDir, "pages", "pages.js"), platform: "browser", format: "iife", target: "chrome120" });
  for (const f of fs.readdirSync(path.join(root, "electron/pages"))) {
    if (f.endsWith(".html") || f.endsWith(".css")) fs.copyFileSync(path.join(root, "electron/pages", f), path.join(outDir, "pages", f));
  }
  fs.copyFileSync(path.join(root, "public/Images/logo.png"), path.join(outDir, "pages", "logo.png"));

  const defaults = {};
  if (process.env.EVENTFLOW_SERVER_URL) {
    const url = new URL(process.env.EVENTFLOW_SERVER_URL);
    if (url.protocol !== "https:") throw new Error("EVENTFLOW_SERVER_URL doit être en https://");
    defaults.serverUrl = url.origin;
  }
  if (process.env.EVENTFLOW_DEFAULT_MODE) {
    if (!["remote", "local"].includes(process.env.EVENTFLOW_DEFAULT_MODE)) throw new Error('EVENTFLOW_DEFAULT_MODE doit valoir "remote" ou "local"');
    defaults.mode = process.env.EVENTFLOW_DEFAULT_MODE;
  }
  fs.writeFileSync(path.join(outDir, "defaults.json"), JSON.stringify(defaults, null, 2));
}

/**
 * Bundle la passerelle vocale Eric en un fichier CommonJS autonome, posé à côté de server.js.
 * - `@/` est résolu vers src/ (alias du tsconfig) ;
 * - `server-only` est neutralisé (son index.js lève une erreur hors runtime Next) ;
 * - les modules natifs/déjà tracés par Next (Prisma, argon2, nodemailer, S3, pdfkit) restent externes
 *   et sont fournis par le node_modules du serveur standalone ; `ws` et `@google/genai`, absents de ce
 *   tracing (utilisés seulement par la passerelle), sont bundlés, en externalisant leurs addons natifs optionnels.
 */
async function buildAssistantGateway() {
  step("Compilation de la passerelle vocale (assistant-gateway.js)");
  const common = { bundle: true, sourcemap: false, logLevel: "warning", legalComments: "none", define: { "process.env.NODE_ENV": '"production"' } };
  await build({
    ...common,
    entryPoints: [path.join(root, "scripts/assistant-gateway.ts")],
    outfile: path.join(serverOut, "assistant-gateway.js"),
    platform: "node",
    format: "cjs",
    target: "node22",
    alias: { "server-only": path.join(root, "node_modules", "server-only", "empty.js") },
    // Externes : uniquement les modules présents dans le node_modules du serveur standalone (Prisma et son
    // moteur natif, argon2 natif, S3 et pdfkit tracés par Next). Les modules absents de ce tracing car
    // utilisés seulement par la passerelle (ws, @google/genai, nodemailer) sont bundlés dans le fichier.
    external: ["@prisma/client", ".prisma/client", "@node-rs/argon2", "@aws-sdk/client-s3", "pdfkit", "bufferutil", "utf-8-validate"],
  });
}

/** Exécute un script Node.js avec l'interpréteur courant (pas de shell : arguments non interprétés). */
function runNode(script, args, env) {
  const res = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: "inherit", env });
  if (res.status !== 0) throw new Error(`${path.basename(script)} ${args.join(" ")} a échoué (code ${res.status})`);
}

function buildNext() {
  step("Build Next.js (sortie standalone dans .next-desktop)");
  runNode(path.join(root, "node_modules", "next", "dist", "bin", "next"), ["build"], {
    ...process.env,
    NODE_ENV: "production",
    NEXT_OUTPUT_STANDALONE: "1",
    NEXT_DIST_DIR: distDir,
    NEXT_TELEMETRY_DISABLED: "1",
    // Passerelle vocale : absente en mode local ; ne pas figer l'URL de développement de .env.local
    NEXT_PUBLIC_ASSISTANT_WS_URL: "",
  });
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true, dereference: true });
}

/** Fichiers à ne jamais embarquer (secrets, configuration locale). */
function removeSensitiveFiles(dir) {
  const removed = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (d === dir && ["storage", "tests", "test-results", "playwright-report", ".git", ".vercel", ".claude"].includes(entry.name)) {
          fs.rmSync(p, { recursive: true, force: true });
          removed.push(path.relative(dir, p));
        } else walk(p);
      } else if (/^\.env(\..*)?$/.test(entry.name) || entry.name.endsWith(".tsbuildinfo")) {
        fs.rmSync(p, { force: true });
        removed.push(path.relative(dir, p));
      }
    }
  };
  walk(dir);
  return removed;
}

function assembleServer() {
  step("Assemblage du serveur embarqué (build/desktop-server)");
  const standalone = path.join(root, distDir, "standalone");
  if (!fs.existsSync(path.join(standalone, "server.js"))) throw new Error(`Sortie standalone introuvable : ${standalone}`);
  fs.rmSync(serverOut, { recursive: true, force: true });
  copyDir(standalone, serverOut);
  // Ressources non copiées par Next : fichiers statiques compilés et dossier public (modèles .glb, images)
  copyDir(path.join(root, distDir, "static"), path.join(serverOut, distDir, "static"));
  copyDir(path.join(root, "public"), path.join(serverOut, "public"));
  // Cache d'exécution éventuellement présent dans la sortie standalone : jamais embarqué
  fs.rmSync(path.join(serverOut, distDir, "cache"), { recursive: true, force: true });
  const removed = removeSensitiveFiles(serverOut);
  if (removed.length) console.log(`  Exclus du paquet : ${removed.join(", ")}`);

  for (const required of ["server.js", path.join(distDir, "BUILD_ID"), path.join("public", "models", "truck.glb"), path.join("node_modules", ".prisma", "client")]) {
    if (!fs.existsSync(path.join(serverOut, required))) throw new Error(`Ressource manquante dans le serveur embarqué : ${required}`);
  }
}

/** Vérifie que le bundle de la passerelle et ses modules externes natifs sont présents dans le serveur embarqué. */
function verifyAssistantRuntime() {
  if (!fs.existsSync(path.join(serverOut, "assistant-gateway.js"))) throw new Error("Ressource manquante dans le serveur embarqué : assistant-gateway.js");
  // @prisma/client est laissé externe (moteur natif) : il doit être présent, tracé par Next depuis les
  // services. Les autres dépendances de la passerelle (ws, @google/genai, nodemailer) sont bundlées.
  for (const required of [path.join("node_modules", "@prisma", "client"), path.join("node_modules", ".prisma", "client")]) {
    if (!fs.existsSync(path.join(serverOut, required))) throw new Error(`Module requis par la passerelle absent du serveur embarqué : ${required} (vérifier le tracing standalone de Next)`);
  }
}

function ensureIcon() {
  if (!fs.existsSync(path.join(root, "build", "icon.png"))) {
    step("Génération de l'icône");
    runNode(path.join(root, "scripts", "electron", "make-icon.mjs"), [], process.env);
  }
}

await buildElectron();
if (!electronOnly) {
  ensureIcon();
  buildNext();
  assembleServer();
  await buildAssistantGateway();
  verifyAssistantRuntime();
}
console.log("\n✔ Build de bureau terminé");
