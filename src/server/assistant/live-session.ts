import "server-only";
import { GoogleGenAI, Modality, type FunctionDeclaration, type LiveConnectConfig, type LiveServerMessage, type Session } from "@google/genai";
import { MIC_SAMPLE_RATE } from "@/features/assistant/protocol";
import { env } from "@/lib/env";

/**
 * Abstraction d'une session Gemini Live : la passerelle ne dépend que de cette interface,
 * ce qui permet de la tester avec une fausse implémentation (aucun appel réseau en test).
 */
export interface LiveSessionLike {
  /** Audio PCM 16 bits 16 kHz du micro */
  sendAudio(pcm: Buffer): void;
  sendAudioEnd(): void;
  sendText(text: string): void;
  /** Réponses aux appels d'outils (`toolCall`) */
  sendToolResponses(responses: ToolResponse[]): void;
  close(): void;
}

export interface ToolResponse {
  id: string;
  name: string;
  response: Record<string, unknown>;
}

export interface LiveSessionEvents {
  onMessage(message: LiveServerMessage): void;
  /** Fermeture de la session côté Google (attendue ou non) */
  onClose(reason: string): void;
  onError(message: string): void;
}

export interface LiveConnectOptions {
  systemInstruction: string;
  /** Poignée de reprise de session (après un `goAway` ou une coupure) */
  resumeHandle?: string;
  /** Voix prédéfinie choisie par l'organisation (sinon GEMINI_LIVE_VOICE) */
  voice?: string;
  /** Outils déclarés au modèle */
  tools: FunctionDeclaration[];
  events: LiveSessionEvents;
}

export type LiveConnector = (options: LiveConnectOptions) => Promise<LiveSessionLike>;

/** Configuration Live commune : audio en sortie, transcriptions, reprise et compression de contexte. */
export function liveConfig(options: Pick<LiveConnectOptions, "systemInstruction" | "resumeHandle" | "tools">, voice?: string): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: options.systemInstruction,
    ...(options.tools.length ? { tools: [{ functionDeclarations: options.tools }] } : {}),
    speechConfig: {
      languageCode: "fr-FR",
      ...(voice ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } : {}),
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: options.resumeHandle ? { handle: options.resumeHandle } : {},
    contextWindowCompression: { slidingWindow: {} },
  };
}

/** Client Gemini côté serveur : les identifiants ne sont jamais exposés au navigateur. */
function createClient() {
  const e = env();
  if (e.GEMINI_BACKEND === "developer") {
    if (!e.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY est requis avec GEMINI_BACKEND=developer");
    return new GoogleGenAI({ apiKey: e.GEMINI_API_KEY });
  }
  // Gemini Enterprise Agent Platform : identifiants Google Cloud par défaut (ADC)
  if (!e.GOOGLE_CLOUD_PROJECT) throw new Error("GOOGLE_CLOUD_PROJECT est requis avec GEMINI_BACKEND=enterprise");
  return new GoogleGenAI({ enterprise: true, project: e.GOOGLE_CLOUD_PROJECT, location: e.GOOGLE_CLOUD_LOCATION });
}

/** Connecteur réel vers Gemini Live (`GEMINI_LIVE_MODEL`). */
export function createGeminiConnector(): LiveConnector {
  const e = env();
  const ai = createClient();

  return async ({ events, ...options }) => {
    const session: Session = await ai.live.connect({
      model: e.GEMINI_LIVE_MODEL,
      config: liveConfig(options, options.voice ?? e.GEMINI_LIVE_VOICE),
      callbacks: {
        onmessage: (m) => events.onMessage(m),
        onerror: (err) => events.onError(err.message || "Erreur de la session Gemini Live"),
        onclose: (ev) => events.onClose(ev.reason || `code ${ev.code}`),
      },
    });
    return {
      sendAudio: (pcm) => session.sendRealtimeInput({ audio: { data: pcm.toString("base64"), mimeType: `audio/pcm;rate=${MIC_SAMPLE_RATE}` } }),
      sendAudioEnd: () => session.sendRealtimeInput({ audioStreamEnd: true }),
      // Les modèles Live 3.x réservent `sendClientContent` à l'amorçage de l'historique : le texte
      // en cours de conversation passe par l'entrée temps réel, comme la voix
      sendText: (text) => session.sendRealtimeInput({ text }),
      sendToolResponses: (functionResponses) => session.sendToolResponse({ functionResponses }),
      close: () => session.close(),
    };
  };
}
