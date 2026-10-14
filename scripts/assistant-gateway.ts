/**
 * Passerelle WebSocket de l'assistant vocal Eric (processus séparé de Next.js) :
 *   npm run assistant:gateway        (ou assistant:dev pour le rechargement automatique)
 * Écoute ASSISTANT_GATEWAY_PORT (3001 par défaut) sur le chemin /ws/assistant.
 * En production, le proxy inverse route /ws/assistant vers ce processus (même origine que l'application).
 */
import { db } from "../src/lib/db";
import { env } from "../src/lib/env";
import { startAssistantGateway } from "../src/server/assistant/gateway";
import { createGeminiConnector } from "../src/server/assistant/live-session";

async function main() {
  if (env().ASSISTANT_ENABLED !== "true") {
    console.warn("[assistant] ASSISTANT_ENABLED n'est pas à \"true\" : les connexions seront refusées (503).");
  }
  const gateway = await startAssistantGateway({ connector: createGeminiConnector() });
  const stop = async () => {
    await gateway.close();
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
