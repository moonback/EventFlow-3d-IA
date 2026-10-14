import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL, E2E_PASSWORD } from "./constants";

/** Recrée la base E2E, applique les migrations puis le jeu de démonstration (seed). */
export default async function globalSetup() {
  const url = E2E_DATABASE_URL;
  if (!/test|e2e/.test(new URL(url).pathname))
    throw new Error(`Refus de réinitialiser une base non dédiée aux tests : ${new URL(url).pathname}`);
  const env = {
    ...process.env,
    DATABASE_URL: url,
    DEMO_PASSWORD: E2E_PASSWORD,
    MAIL_DRIVER: "disabled",
    NODE_ENV: "development" as const,
  };
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS "public" CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA "public"');
  } finally {
    await prisma.$disconnect();
  }
  execSync("npx prisma migrate deploy", { stdio: "pipe", env });
  execSync("npx tsx --conditions=react-server prisma/seed.ts", { stdio: "pipe", env });
}
