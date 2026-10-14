/**
 * Vérifie le contenu du build de bureau et, s'il existe, du paquet electron-builder :
 * ressources requises, modèles 3D, modules natifs, absence de fichiers .env et de secrets.
 *   node scripts/electron/verify-package.mjs
 * Les valeurs secrètes ne sont jamais affichées : seul le nom de la variable concernée l'est.
 */
import asar from "@electron/asar";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const failures = [];
const ok = (msg) => console.log(`  ✔ ${msg}`);
const fail = (msg) => {
  failures.push(msg);
  console.log(`  ✘ ${msg}`);
};
const exists = (p, label = p) => (fs.existsSync(p) ? ok(label) : fail(`absent : ${label}`));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Valeurs sensibles des fichiers .env locaux (jamais affichées). */
function localSecrets() {
  const secrets = new Map();
  for (const f of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    const file = path.join(root, f);
    if (!fs.existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(file, "utf8")))) {
      if (typeof value !== "string" || value.length < 8) continue;
      if (/PASSWORD|SECRET|TOKEN|KEY|DATABASE_URL|CREDENTIALS/i.test(key) && !/^change-me/.test(value)) secrets.set(`${f}:${key}`, Buffer.from(value));
    }
  }
  return secrets;
}

function scanFiles(label, files, readFile, secrets) {
  let envFiles = 0;
  const leaks = new Set();
  for (const f of files) {
    if (/(^|[\\/])\.env(\.[^\\/]*)?$/.test(f)) {
      envFiles++;
      fail(`${label} : fichier d'environnement embarqué ${f}`);
    }
    const buf = readFile(f);
    if (!buf || buf.length > 64 * 1024 * 1024) continue;
    for (const [name, value] of secrets) if (buf.includes(value)) leaks.add(`${name} dans ${path.basename(f)}`);
  }
  if (!envFiles) ok(`${label} : aucun fichier .env`);
  if (leaks.size) for (const l of leaks) fail(`${label} : secret local retrouvé (${l})`);
  else ok(`${label} : aucun secret local (${secrets.size} valeurs contrôlées, ${files.length} fichiers)`);
}

const secrets = localSecrets();

console.log("\nProcessus Electron (dist-electron)");
for (const f of ["main.js", "preload.js", "defaults.json", "pages/loading.html", "pages/error.html", "pages/setup.html", "pages/pages.js", "pages/pages.css", "pages/logo.png"]) exists(path.join(root, "dist-electron", f), `dist-electron/${f}`);

console.log("\nServeur embarqué (build/desktop-server)");
const server = path.join(root, "build", "desktop-server");
exists(path.join(server, "server.js"), "server.js");
exists(path.join(server, ".next-desktop", "BUILD_ID"), ".next-desktop/BUILD_ID");
exists(path.join(server, ".next-desktop", "static"), ".next-desktop/static");
for (const m of fs.readdirSync(path.join(root, "public", "models"))) exists(path.join(server, "public", "models", m), `public/models/${m}`);
exists(path.join(server, "public", "Images", "logo.png"), "public/Images/logo.png");
const serverFiles = walk(server);
const has = (re, label) => (serverFiles.some((f) => re.test(f)) ? ok(label) : fail(`absent : ${label}`));
has(/[\\/]\.prisma[\\/]client[\\/].*query_engine.*\.node$/, "moteur Prisma (.node)");
has(/[\\/]\.prisma[\\/]client[\\/]schema\.prisma$/, "schéma Prisma");
has(/[\\/]@node-rs[\\/]argon2-win32-x64-msvc[\\/].*\.node$/, "Argon2 natif (win32-x64)");
has(/[\\/]pdfkit[\\/]js[\\/]data[\\/]Helvetica\.afm$/, "polices PDFKit");
if (serverFiles.some((f) => /[\\/]storage[\\/]uploads[\\/]/.test(f))) fail("fichiers téléversés locaux embarqués");
scanFiles("serveur embarqué", serverFiles, (f) => (/\.(js|json|mjs|cjs|txt|map|html|css|prisma|env|yml|yaml|ts)$/i.test(f) || path.basename(f).startsWith(".") ? fs.readFileSync(f) : null), secrets);

const release = path.join(root, "release", pkg.version);
if (fs.existsSync(release)) {
  console.log(`\nPaquet (${path.relative(root, release)})`);
  const resources = path.join(release, "win-unpacked", "resources");
  const asarFile = path.join(resources, "app.asar");
  exists(path.join(release, "win-unpacked", "EventFlow.exe"), "win-unpacked/EventFlow.exe");
  exists(asarFile, "resources/app.asar");
  exists(path.join(resources, "desktop-server", "server.js"), "resources/desktop-server/server.js");
  exists(path.join(resources, "desktop-server", ".next-desktop", "BUILD_ID"), "resources/desktop-server/.next-desktop/BUILD_ID");
  const packagedFiles = walk(path.join(resources, "desktop-server"));
  if (packagedFiles.length === serverFiles.length) ok(`resources/desktop-server : ${packagedFiles.length} fichiers (identique au build)`);
  else fail(`resources/desktop-server : ${packagedFiles.length} fichiers au lieu de ${serverFiles.length}`);
  for (const [re, label] of [[/[\\/]\.prisma[\\/]client[\\/].*query_engine.*\.node$/, "moteur Prisma"], [/argon2-win32-x64-msvc[\\/].*\.node$/, "Argon2 natif"]]) {
    if (packagedFiles.some((f) => re.test(f))) ok(`paquet : ${label}`);
    else fail(`paquet sans ${label}`);
  }
  for (const m of fs.readdirSync(path.join(root, "public", "models"))) exists(path.join(resources, "desktop-server", "public", "models", m), `resources/desktop-server/public/models/${m}`);
  exists(path.join(resources, "icon.png"), "resources/icon.png");
  if (fs.existsSync(asarFile)) {
    const entries = asar.listPackage(asarFile, { isPack: false }).map((e) => e.replace(/\\/g, "/"));
    if (entries.some((e) => e.includes("/node_modules/"))) fail("app.asar contient node_modules");
    else ok(`app.asar : ${entries.length} entrées, sans node_modules`);
    for (const required of ["/dist-electron/main.js", "/dist-electron/preload.js", "/package.json"]) {
      if (entries.includes(required)) ok(`app.asar${required}`);
      else fail(`app.asar sans ${required}`);
    }
    scanFiles("app.asar", entries.filter((e) => !e.endsWith("/")), (e) => {
      try {
        return asar.extractFile(asarFile, e.replace(/^\//, ""));
      } catch {
        return null;
      }
    }, secrets);
  }
  scanFiles("ressources du paquet", walk(resources).filter((f) => !f.endsWith("app.asar")), (f) => (/\.(js|json|mjs|cjs|txt|html|prisma|yml|yaml)$/i.test(f) || path.basename(f).startsWith(".") ? fs.readFileSync(f) : null), secrets);
  const installer = path.join(release, `EventFlow-Setup-${pkg.version}.exe`);
  if (fs.existsSync(installer)) ok(`installateur : ${path.relative(root, installer)} (${(fs.statSync(installer).size / 1024 / 1024).toFixed(1)} Mo)`);
  else console.log("  · installateur non généré (npm run electron:dist)");
}

console.log(failures.length ? `\n✘ ${failures.length} problème(s)` : "\n✔ Vérification réussie");
process.exit(failures.length ? 1 : 0);
