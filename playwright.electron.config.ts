import { defineConfig } from "@playwright/test";

/**
 * Tests de l'application de bureau (Electron) : lance le vrai processus principal, qui démarre le
 * serveur Next.js standalone embarqué (build/desktop-server) sur la base E2E dédiée, recréée et peuplée
 * avec les données de démonstration. Prérequis : `npm run electron:build` et PostgreSQL accessible.
 */
export default defineConfig({
  testDir: "tests/electron",
  globalSetup: "./tests/electron/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
});
