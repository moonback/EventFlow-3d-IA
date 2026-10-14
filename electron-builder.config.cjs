/**
 * Packaging EventFlow Desktop (electron-builder) — voir docs/ELECTRON.md.
 *
 * Variables facultatives au moment du build :
 *   EVENTFLOW_UPDATE_URL  source HTTPS des mises à jour (fournisseur "generic") ; absente → mises à jour désactivées
 *   CSC_LINK / CSC_KEY_PASSWORD  certificat de signature Authenticode (sinon installateur non signé)
 */
const updateUrl = process.env.EVENTFLOW_UPDATE_URL;
if (updateUrl && !updateUrl.startsWith("https://")) throw new Error("EVENTFLOW_UPDATE_URL doit être en https://");

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "fr.eventflow.desktop",
  productName: "EventFlow",
  executableName: "EventFlow",
  copyright: "© EventFlow",
  directories: { output: "release/${version}", buildResources: "build" },
  // Code Electron bundlé par esbuild : aucune dépendance npm dans app.asar
  files: ["dist-electron/**/*", "package.json", "!**/node_modules/**"],
  extraMetadata: { main: "dist-electron/main.js", author: { name: "EventFlow" } },
  // Serveur Next.js standalone hors asar (modules natifs N-API : moteur Prisma, Argon2).
  // Source = build/ et non build/desktop-server : electron-builder exclut toujours le node_modules
  // situé à la racine d'une source extraResources (→ resources/desktop-server).
  extraResources: [
    { from: "build", to: ".", filter: ["desktop-server/**/*"] },
    { from: "build/icon.png", to: "icon.png" },
  ],
  asar: true,
  npmRebuild: false,
  nodeGypRebuild: false,
  // Durcissement du binaire Electron
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  },
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: "build/icon.png",
    artifactName: "EventFlow-Setup-${version}.${ext}",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: "always",
    createStartMenuShortcut: true,
    shortcutName: "EventFlow",
    uninstallDisplayName: "EventFlow",
    // Les préférences et server.env (userData) sont conservés à la désinstallation
    deleteAppDataOnUninstall: false,
    installerLanguages: ["fr_FR"],
    language: "1036",
    runAfterFinish: true,
  },
  // Préparation macOS (non construit ni testé à ce stade) — voir docs/ELECTRON.md
  mac: {
    target: [{ target: "dmg", arch: ["arm64", "x64"] }],
    category: "public.app-category.business",
    hardenedRuntime: true,
    icon: "build/icon.png",
  },
  publish: updateUrl ? [{ provider: "generic", url: updateUrl }] : null,
};
