import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL, E2E_PORT } from "./tests/e2e/constants";

/**
 * Tests navigateur sur une base DÉDIÉE (eventflow_e2e), recréée et peuplée avec les données
 * de démonstration à chaque exécution. L'application est construite puis servie en mode production.
 * E2E_DATABASE_URL permet de cibler une autre base (son nom doit contenir « e2e » ou « test »).
 */
const PORT = E2E_PORT;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        // Rendu WebGL logiciel pour exécuter la scène 3D sans GPU
        launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
      },
    },
  ],
  webServer: {
    command: process.env.E2E_SKIP_BUILD
      ? `npx next start -p ${PORT}`
      : `npm run build && npx next start -p ${PORT}`,
    url: `${baseURL}/api/health`,
    timeout: 600_000,
    reuseExistingServer: false,
    stdout: "pipe",
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      APP_URL: baseURL,
      MAIL_DRIVER: "disabled",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: "./storage/e2e-uploads",
      CRON_SECRET: "e2e-cron-secret",
    },
  },
});
