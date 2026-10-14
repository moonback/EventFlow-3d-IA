/**
 * Protocole applicatif entre le navigateur et la passerelle de l'assistant (`/ws/assistant`).
 *
 * - Trames **binaires** : audio PCM 16 bits little-endian mono — 16 kHz du navigateur vers le
 *   serveur (micro), 24 kHz du serveur vers le navigateur (voix d'Eric).
 * - Trames **texte** : messages JSON ci-dessous. Le serveur valide tout message client avec Zod.
 */
import { z } from "zod";

export const ASSISTANT_WS_PATH = "/ws/assistant";
export const MIC_SAMPLE_RATE = 16_000;
export const SPEAKER_SAMPLE_RATE = 24_000;
/** Taille maximale d'une trame audio montante (≈ 1 s de PCM 16 kHz) */
export const MAX_AUDIO_FRAME_BYTES = 32_000;
/** Taille maximale d'un message texte saisi */
export const MAX_TEXT_LENGTH = 2_000;
/** Taille maximale du résultat d'une commande de scène renvoyé par le navigateur (JSON) */
export const MAX_WORLD_RESULT_CHARS = 8_000;

export const clientMessageSchema = z.discriminatedUnion("type", [
  /** Message saisi au clavier (même conversation que la voix) */
  z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(MAX_TEXT_LENGTH) }),
  /** Le micro est coupé : fin du flux audio */
  z.object({ type: z.literal("audio_end") }),
  /** Fin de la conversation demandée par l'utilisateur */
  z.object({ type: z.literal("hangup") }),
  /** Réponse de l'utilisateur (clic) à une demande de confirmation d'action */
  z.object({ type: z.literal("confirm_answer"), id: z.string().min(1).max(100), approved: z.boolean() }),
  /** Résultat d'une commande de scène (`world_call`) exécutée par le navigateur */
  z.object({
    type: z.literal("world_result"),
    id: z.string().min(1).max(100),
    result: z.record(z.string(), z.unknown()).refine((r) => JSON.stringify(r).length <= MAX_WORLD_RESULT_CHARS, "Résultat trop volumineux"),
  }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type AssistantServerState = "connecting" | "ready";

export type ServerMessage =
  | { type: "state"; state: AssistantServerState }
  /** Fragment de transcription (à concaténer au tour en cours du même locuteur) */
  | { type: "transcript"; role: "user" | "eric"; text: string }
  /** L'utilisateur a coupé la parole à Eric : vider immédiatement la file audio */
  | { type: "interrupted" }
  /** Eric a terminé son tour de parole */
  | { type: "turn_complete" }
  /** Eric consulte des données (outil en cours, terminé ou en échec) */
  | { type: "tool"; id: string; label: string; state: "running" | "done" | "error" }
  /** Commande de scène à exécuter par le navigateur, qui répond par `world_result` */
  | { type: "world_call"; id: string; name: string; args: Record<string, unknown> }
  /** Eric propose une action : l'utilisateur confirme ou refuse par un clic (`confirm_answer`) */
  | { type: "confirm_request"; id: string; title: string; details: string[]; danger: boolean; expiresInSec: number }
  /** Fin d'une demande de confirmation (exécutée, refusée, expirée, abandonnée ou en échec) */
  | { type: "confirm_closed"; id: string; outcome: ConfirmOutcome; message: string }
  | { type: "error"; code: AssistantErrorCode; message: string };

export type ConfirmOutcome = "done" | "cancelled" | "expired" | "withdrawn" | "failed";

export type AssistantErrorCode = "LIVE_UNAVAILABLE" | "BAD_MESSAGE" | "SESSION_EXPIRED" | "IDLE_TIMEOUT" | "MAX_DURATION" | "REPLACED";

/** Codes de fermeture WebSocket applicatifs (plage 4000–4999) */
export const CLOSE_CODES = {
  HANGUP: 4000,
  REPLACED: 4001,
  IDLE_TIMEOUT: 4002,
  MAX_DURATION: 4003,
  SESSION_EXPIRED: 4401,
  LIVE_UNAVAILABLE: 4502,
} as const;

/** Analyse tolérante d'un message client (texte JSON) ; `null` si invalide. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = clientMessageSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
