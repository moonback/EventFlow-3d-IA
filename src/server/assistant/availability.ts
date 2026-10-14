import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { decryptSecret } from "../crypto/secret-box";

export interface AssistantOrgSettings {
  /** Assistant activé par l'organisation (Paramètres → Organisation) */
  orgEnabled: boolean;
  /** Voix choisie par l'organisation (undefined : voix du serveur, GEMINI_LIVE_VOICE) */
  voice: string | undefined;
  /** Durée maximale choisie par l'organisation, en minutes (undefined : valeur du serveur) */
  maxSessionMinutes: number | undefined;
  /** Clé API Gemini de l'organisation, déchiffrée (undefined : identifiants du serveur). Serveur uniquement. */
  apiKey: string | undefined;
}

/** Réglages de l'assistant propres à une organisation (une organisation inconnue est désactivée). */
export async function assistantOrgSettings(organizationId: string): Promise<AssistantOrgSettings> {
  const o = await db.organization.findUnique({
    where: { id: organizationId },
    select: { assistantEnabled: true, assistantVoice: true, assistantMaxSessionMinutes: true, assistantApiKeyEncrypted: true },
  });
  return {
    orgEnabled: o?.assistantEnabled ?? false,
    voice: o?.assistantVoice ?? undefined,
    maxSessionMinutes: o?.assistantMaxSessionMinutes ?? undefined,
    apiKey: o?.assistantApiKeyEncrypted ? (decryptSecret(o.assistantApiKeyEncrypted) ?? undefined) : undefined,
  };
}

/** L'assistant est-il disponible pour l'organisation : passerelle activée sur le serveur ET par l'organisation. */
export async function isAssistantAvailable(organizationId: string): Promise<boolean> {
  if (env().ASSISTANT_ENABLED !== "true") return false;
  return (await assistantOrgSettings(organizationId)).orgEnabled;
}
