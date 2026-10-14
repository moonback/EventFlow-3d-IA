import fs from "node:fs";
import path from "node:path";
import e2eGlobalSetup from "../e2e/global-setup";

/** Vérifie que le build de bureau existe, puis recrée la base E2E (mêmes données que les tests navigateur). */
export default async function globalSetup() {
  const root = path.resolve(__dirname, "..", "..");
  for (const required of ["dist-electron/main.js", "dist-electron/preload.js", "build/desktop-server/server.js"]) {
    if (!fs.existsSync(path.join(root, required))) throw new Error(`${required} introuvable : exécuter « npm run electron:build » avant « npm run electron:test ».`);
  }
  await e2eGlobalSetup();
}
