export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://eventflow:eventflow@localhost:5432/eventflow_e2e?schema=public";
/** Mot de passe des comptes de démonstration dans la base E2E uniquement. */
export const E2E_PASSWORD = "E2e!password-2026";
