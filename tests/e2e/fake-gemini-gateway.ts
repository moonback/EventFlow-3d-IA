/**
 * Passerelle de l'assistant pour les tests de bout en bout : la VRAIE passerelle (authentification,
 * outils, confirmations, base E2E), avec un Gemini remplacé par un script déterministe.
 * Lancée par Playwright : tsx --conditions=react-server tests/e2e/fake-gemini-gateway.ts
 */
import type { LiveServerMessage } from "@google/genai";
import { db } from "../../src/lib/db";
import { startAssistantGateway } from "../../src/server/assistant/gateway";
import type { LiveConnector } from "../../src/server/assistant/live-session";

const scripted: LiveConnector = async ({ events }) => {
  let n = 0;
  const emit = (m: Partial<LiveServerMessage>) => events.onMessage(m as LiveServerMessage);
  const say = (text: string) => {
    emit({ serverContent: { outputTranscription: { text } } });
    emit({ serverContent: { turnComplete: true } });
  };
  const call = (name: string, args: Record<string, unknown>) => emit({ toolCall: { functionCalls: [{ id: `e2e-${++n}`, name, args }] } });

  return {
    sendAudio: () => undefined,
    sendAudioEnd: () => undefined,
    sendText: (text) => {
      void (async () => {
        if (/nova/i.test(text) && /pr[êe]t/i.test(text)) {
          const event = await db.event.findFirstOrThrow({ where: { name: "Lancement Nova X" }, select: { id: true } });
          call("change_event_status", { event_id: event.id, status: "READY" });
        } else if (/montre/i.test(text)) call("show_object", { target: "GA-125-EV" });
        else say("Je n'ai pas compris.");
      })();
    },
    sendToolResponses: (responses) => {
      for (const r of responses) {
        const output = r.response.output as { status?: string; ok?: boolean } | undefined;
        if (r.name === "show_object") say(output?.ok ? "Voici le Renault Master." : "Je ne le trouve pas.");
        else if (output?.status === "done") say("C'est fait.");
        else if (output?.status === "cancelled_by_user") say("D'accord, je ne change rien.");
        else say(`Échec : ${String(r.response.error ?? output?.status)}`);
      }
    },
    close: () => undefined,
  };
};

startAssistantGateway({ connector: scripted, enabled: true }).catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
