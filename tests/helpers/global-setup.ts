import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { loadTestEnv } from "./load-test-env";

/**
 * Recrée le schéma de la base DE TEST (garde-fou sur le nom dans loadTestEnv) puis applique
 * les migrations — on valide ainsi les migrations à chaque exécution.
 */
export default async function setup() {
  loadTestEnv();
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS "public" CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA "public"');
  } finally {
    await prisma.$disconnect();
  }
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: process.env });
}
