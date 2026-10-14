"use client";
import { AudioLines, Mic, MicOff, PhoneOff, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAssistant, type AssistantStatus } from "@/assistant/use-assistant";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<AssistantStatus, string> = {
  idle: "Hors ligne",
  connecting: "Connexion…",
  listening: "À l'écoute",
  speaking: "Eric parle",
  error: "Indisponible",
};

const CONSENT_KEY = "eventflow.assistant.consent";

function readConsent() {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Panneau de conversation avec Eric (coin inférieur droit de la scène). */
export function AssistantPanel() {
  const a = useAssistant();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [consent, setConsent] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => setConsent(readConsent()), []);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [a.lines]);

  const connected = a.status === "listening" || a.status === "speaking" || a.status === "connecting";

  const start = () => {
    if (!consent) {
      try {
        window.localStorage.setItem(CONSENT_KEY, "1");
      } catch {
        // stockage indisponible : le consentement sera redemandé
      }
      setConsent(true);
    }
    void a.start();
  };

  if (!open) {
    return (
      <Button className="absolute right-3 bottom-3 z-10 rounded-full shadow-lg" onClick={() => setOpen(true)} aria-label="Ouvrir la conversation avec Eric">
        <AudioLines /> Parler à Eric
      </Button>
    );
  }

  return (
    <section className="absolute right-3 bottom-3 z-10 flex max-h-[min(460px,calc(100%-1.5rem))] w-[min(340px,calc(100%-1.5rem))] flex-col rounded-xl border border-border bg-background/95 text-sm shadow-lg backdrop-blur" aria-label="Conversation avec Eric">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span
          className={cn(
            "size-2.5 rounded-full",
            a.status === "speaking" ? "animate-pulse bg-success" : a.status === "listening" ? "bg-info" : a.status === "connecting" ? "animate-pulse bg-warning" : a.status === "error" ? "bg-destructive" : "bg-muted-foreground",
          )}
          aria-hidden
        />
        <span className="font-medium">Eric</span>
        <span className="text-xs text-muted-foreground" role="status">
          {STATUS_LABELS[a.status]}
        </span>
        <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={() => setOpen(false)} aria-label="Réduire la conversation">
          <X />
        </Button>
      </header>

      <div ref={scroller} className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2" aria-live="polite">
        {a.lines.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {connected ? "Parlez, Eric vous écoute. Vous pouvez lui couper la parole à tout moment." : "Eric, le régisseur virtuel, répond à la voix en temps réel."}
          </p>
        ) : (
          a.lines.map((l) => (
            <p key={l.id} className={cn("max-w-[85%] rounded-lg px-2.5 py-1.5", l.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted")}>
              <span className="sr-only">{l.role === "user" ? "Vous : " : "Eric : "}</span>
              {l.text}
            </p>
          ))
        )}
        {a.error ? <p className="text-xs text-destructive">{a.error}</p> : null}
      </div>

      {connected ? (
        <footer className="flex flex-col gap-2 border-t border-border p-2">
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              a.sendText(draft);
              setDraft("");
            }}
          >
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Écrire à Eric…" className="h-8" aria-label="Message à Eric" maxLength={2000} />
            <Button type="submit" size="icon-sm" variant="outline" disabled={!draft.trim() || a.status === "connecting"} aria-label="Envoyer">
              <Send />
            </Button>
          </form>
          <div className="flex items-center gap-2">
            <Button size="sm" variant={a.micOn ? "secondary" : "outline"} onClick={a.toggleMic} aria-pressed={a.micOn} disabled={a.status === "connecting"}>
              {a.micOn ? <Mic /> : <MicOff />} {a.micOn ? "Micro actif" : "Micro coupé"}
            </Button>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full bg-info transition-[width] duration-75" style={{ width: `${a.micOn ? a.micLevel * 100 : 0}%` }} />
            </span>
            <Button size="icon-sm" variant="destructive" onClick={a.stop} aria-label="Raccrocher">
              <PhoneOff />
            </Button>
          </div>
        </footer>
      ) : (
        <footer className="flex flex-col gap-2 border-t border-border p-2">
          {!consent ? <p className="text-xs text-muted-foreground">Votre voix et vos messages sont transmis à Google Gemini pour être traités.</p> : null}
          <Button onClick={start}>
            <Mic /> {a.status === "error" ? "Réessayer" : "Démarrer la conversation"}
          </Button>
        </footer>
      )}
    </section>
  );
}
