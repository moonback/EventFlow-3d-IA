/**
 * Vérifie la configuration Gemini Live de l'assistant (modèle, région, identifiants) :
 *   npm run assistant:check
 * Ouvre une session, envoie une phrase, attend la voix et la transcription d'Eric, puis ferme.
 * Coût : un seul échange de quelques secondes.
 */
import { env } from "../src/lib/env";
import { buildSystemInstruction } from "../src/features/assistant/persona";
import { SPEAKER_SAMPLE_RATE } from "../src/features/assistant/protocol";
import { createGeminiConnector } from "../src/server/assistant/live-session";

const TIMEOUT_MS = 30_000;

async function main() {
  const e = env();
  const target = e.GEMINI_BACKEND === "enterprise" ? `Enterprise, projet ${e.GOOGLE_CLOUD_PROJECT ?? "?"}, région ${e.GOOGLE_CLOUD_LOCATION}` : "Gemini API (clé)";
  console.log(`Modèle ${e.GEMINI_LIVE_MODEL} — ${target}`);

  let audioBytes = 0;
  let transcript = "";
  let firstAudioAt = 0;
  const sentAt = { t: 0 };
  let finish: (error?: Error) => void = () => undefined;
  const done = new Promise<void>((resolve, reject) => {
    finish = (error) => (error ? reject(error) : resolve());
  });

  const t0 = Date.now();
  const session = await createGeminiConnector()({
    systemInstruction: buildSystemInstruction({ organizationName: "Agence de test", userName: "Testeur", role: "OWNER", timezone: "Europe/Paris", now: new Date() }),
    events: {
      onMessage: (m) => {
        for (const part of m.serverContent?.modelTurn?.parts ?? []) {
          if (part.inlineData?.data) {
            if (!firstAudioAt) firstAudioAt = Date.now();
            audioBytes += Buffer.from(part.inlineData.data, "base64").length;
          }
        }
        transcript += m.serverContent?.outputTranscription?.text ?? "";
        if (m.serverContent?.turnComplete) finish();
      },
      onError: (message) => finish(new Error(message)),
      onClose: (reason) => finish(new Error(`Session fermée avant la fin du tour : ${reason}`)),
    },
  });
  console.log(`Session ouverte en ${Date.now() - t0} ms`);
  sentAt.t = Date.now();
  session.sendText("Présente-toi en une phrase.");

  const timer = setTimeout(() => finish(new Error(`Aucune réponse complète en ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS);
  try {
    await done;
  } finally {
    clearTimeout(timer);
    session.close();
  }
  if (audioBytes === 0) throw new Error("Aucun audio reçu");
  console.log(`Premier son après ${firstAudioAt - sentAt.t} ms ; ${(audioBytes / 2 / SPEAKER_SAMPLE_RATE).toFixed(1)} s d'audio`);
  console.log(`Transcription : ${transcript.trim() || "(aucune)"}`);
  console.log("OK");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("ÉCHEC :", error instanceof Error ? error.message : error);
    process.exit(1);
  });
