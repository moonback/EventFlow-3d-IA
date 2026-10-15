"use client";
import { ArrowUp, Check, Loader2, Mic, MicOff, Minus, PhoneOff, ShieldCheck, Sparkles, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AssistantStatus, useAssistant } from "@/assistant/use-assistant";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<AssistantStatus, string> = {
  idle: "Hors ligne",
  connecting: "Connexion…",
  listening: "À l'écoute",
  speaking: "Parle",
  error: "Indisponible",
};

const STATUS_DOT: Record<AssistantStatus, string> = {
  idle: "bg-muted-foreground",
  connecting: "animate-pulse bg-warning",
  listening: "bg-success",
  speaking: "bg-info",
  error: "bg-destructive",
};

/** Questions d'amorce proposées tant que la conversation est vide */
const SUGGESTIONS = ["Quels événements cette semaine ?", "Du matériel en rupture ?", "Où sont les véhicules ?"];

const CONSENT_KEY = "eventflow.assistant.consent";
const BARS = 5;

function readConsent() {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

function storeConsent() {
  try {
    window.localStorage.setItem(CONSENT_KEY, "1");
  } catch {
    // stockage indisponible : le consentement sera redemandé
  }
}

/**
 * Clic sur Eric (bouton flottant ou avatar 3D) : le premier clic lance la conversation vocale
 * sans ouvrir le panneau, les suivants ouvrent ou referment le panneau.
 */
export function activateOrToggleEric(status: AssistantStatus, start: () => Promise<void> | void, toggle: () => void) {
  if (status === "idle" || status === "error") {
    storeConsent();
    void start();
  } else toggle();
}

/** Pastille d'Eric : initiale sur dégradé, point de statut en surimpression. */
function EricAvatar({ status, size = "md" }: { status?: AssistantStatus; size?: "sm" | "md" }) {
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-info font-semibold text-primary-foreground shadow-sm", size === "md" ? "size-9 text-sm" : "size-6 text-[10px]")} aria-hidden>
      E
      {status ? <span className={cn("absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-background", STATUS_DOT[status])} /> : null}
    </span>
  );
}

/** Égaliseur compact piloté par un niveau 0..1 */
function LevelBars({ level, className }: { level: number; className?: string }) {
  return (
    <span className={cn("flex h-4 items-center gap-[2px]", className)} aria-hidden>
      {Array.from({ length: BARS }, (_, i) => {
        // Barres centrales plus hautes : silhouette d'onde
        const shape = 1 - Math.abs(i - (BARS - 1) / 2) / BARS;
        return <span key={i} className="w-[3px] rounded-full bg-current transition-[height] duration-75" style={{ height: `${Math.max(18, Math.min(100, level * shape * 160))}%` }} />;
      })}
    </span>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {[0, 150, 300].map((d) => (
        <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

/** Panneau de conversation avec Eric (coin inférieur droit de la scène). */
export function AssistantPanel({ assistant: a, open, onOpenChange: setOpen }: { assistant: ReturnType<typeof useAssistant>; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [draft, setDraft] = useState("");
  const [consent, setConsent] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => setConsent(readConsent()), []);
  // Niveaux micro / voix lus à ~15 images/s, localement : seul le panneau se redessine
  const [micLevel, setMicLevel] = useState(0);
  const [voice, setVoice] = useState(0);
  const micOn = a.micOn;
  const readLevel = a.micLevel;
  const readVoice = a.voiceLevel;
  const speaking = a.status === "speaking";
  useEffect(() => {
    if (!micOn || !open) return setMicLevel(0);
    const t = setInterval(() => setMicLevel(Math.round(readLevel() * 20) / 20), 66);
    return () => clearInterval(t);
  }, [micOn, open, readLevel]);
  useEffect(() => {
    if (!speaking || !open) return setVoice(0);
    const t = setInterval(() => setVoice(Math.round(readVoice() * 20) / 20), 66);
    return () => clearInterval(t);
  }, [speaking, open, readVoice]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [a.lines, a.activity, a.confirmations]);

  const connected = a.status === "listening" || a.status === "speaking" || a.status === "connecting";

  const start = () => {
    if (!consent) {
      storeConsent();
      setConsent(true);
    }
    void a.start();
  };

  const send = (text: string) => {
    if (!text.trim()) return;
    a.sendText(text);
    setDraft("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!connected) setConsent(true);
          activateOrToggleEric(a.status, a.start, () => setOpen(true));
        }}
        aria-label={connected ? "Ouvrir la conversation avec Eric" : "Démarrer la conversation avec Eric"}
        title={connected ? "Ouvrir la conversation" : "Cliquer pour parler à Eric, puis à nouveau pour ouvrir la conversation"}
        className="group absolute right-3 bottom-3 z-10 flex items-center gap-2.5 rounded-full border border-border bg-background/90 py-1.5 pr-4 pl-1.5 text-sm shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="relative">
          {connected ? <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" aria-hidden /> : null}
          <EricAvatar status={a.status} />
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className="font-medium">Eric</span>
          <span className="text-[11px] text-muted-foreground">
            {connected ? `${STATUS_LABELS[a.status]} · ouvrir` : a.status === "error" ? "Indisponible · réessayer" : consent ? "Cliquer pour parler" : "Voix traitée par Google Gemini"}
          </span>
        </span>
      </button>
    );
  }

  return (
    <section
      className="absolute right-3 bottom-3 z-10 flex h-[min(520px,calc(100%-1.5rem))] w-[min(360px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background/95 text-sm shadow-2xl backdrop-blur-md"
      aria-label="Conversation avec Eric"
    >
      <header className="flex items-center gap-2.5 border-b border-border bg-gradient-to-b from-muted/60 to-transparent px-3 py-2.5">
        <EricAvatar status={a.status} />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="font-semibold">Eric</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            {STATUS_LABELS[a.status]}
            {speaking ? <LevelBars level={voice} className="h-3 text-info" /> : null}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          {connected ? (
            <Button size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={a.stop} aria-label="Raccrocher" title="Raccrocher">
              <PhoneOff />
            </Button>
          ) : null}
          <Button size="icon-sm" variant="ghost" onClick={() => setOpen(false)} aria-label="Réduire la conversation" title="Réduire">
            {connected ? <Minus /> : <X />}
          </Button>
        </div>
      </header>

      <div ref={scroller} className="flex min-h-24 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3" aria-live="polite">
        {a.lines.length === 0 ? (
          <div className="m-auto flex max-w-[260px] flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div className="flex flex-col gap-1">
              <p className="font-medium">{connected ? "Eric vous écoute" : "Votre régisseur virtuel"}</p>
              <p className="text-xs text-muted-foreground">
                {connected ? "Parlez naturellement ou écrivez. Vous pouvez lui couper la parole à tout moment." : "Posez vos questions à la voix sur les événements, le stock, les véhicules, l'équipe et les finances."}
              </p>
            </div>
            {connected ? (
              <div className="flex flex-wrap justify-center gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    disabled={a.status === "connecting"}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          a.lines.map((l, i) => {
            const firstOfGroup = a.lines[i - 1]?.role !== l.role;
            return l.role === "user" ? (
              <p key={l.id} className={cn("max-w-[82%] self-end rounded-2xl rounded-br-md bg-primary px-3 py-2 text-primary-foreground shadow-sm", !firstOfGroup && "-mt-2")}>
                <span className="sr-only">Vous : </span>
                {l.text}
              </p>
            ) : (
              <div key={l.id} className={cn("flex max-w-[88%] items-end gap-2 self-start", !firstOfGroup && "-mt-2")}>
                {firstOfGroup ? <EricAvatar size="sm" /> : <span className="w-6 shrink-0" aria-hidden />}
                <p className="rounded-2xl rounded-bl-md bg-muted px-3 py-2">
                  <span className="sr-only">Eric : </span>
                  {l.text}
                </p>
              </div>
            );
          })
        )}
        {a.activity ? (
          <div className="flex items-center gap-2 self-start">
            <EricAvatar size="sm" />
            <span className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              <TypingDots /> Consulte {a.activity}…
            </span>
          </div>
        ) : null}
        {a.confirmations.map((c) => (
          <div
            key={c.id}
            role="group"
            aria-label={`Action proposée : ${c.title}`}
            className={cn("flex flex-col gap-2 rounded-xl border p-3 text-xs shadow-sm", c.danger ? "border-warning/50 bg-warning/5" : "border-border bg-card")}
          >
            <p className="flex items-start gap-2 text-sm font-medium text-foreground">
              <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md", c.danger ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary")}>
                {c.danger ? <TriangleAlert className="size-3.5" aria-hidden /> : <ShieldCheck className="size-3.5" aria-hidden />}
              </span>
              <span>
                <span className="block text-[11px] font-normal tracking-wide text-muted-foreground uppercase">Action proposée</span>
                {c.title}
              </span>
            </p>
            {c.details.length ? (
              <ul className="flex flex-col gap-1 border-l-2 border-border pl-2.5 text-muted-foreground">
                {c.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
            {c.outcome ? (
              <p className={cn("flex items-center gap-1.5 font-medium", c.outcome.kind === "done" ? "text-success" : c.outcome.kind === "failed" ? "text-destructive" : "text-muted-foreground")} role="status">
                {c.outcome.kind === "done" ? <Check className="size-3.5" aria-hidden /> : null}
                {c.outcome.message}
              </p>
            ) : (
              <div className="flex gap-1.5 pt-0.5">
                <Button size="sm" className="flex-1" variant={c.danger ? "destructive" : "default"} onClick={() => a.answer(c.id, true)}>
                  <Check /> Confirmer
                </Button>
                <Button size="sm" className="flex-1" variant="outline" onClick={() => a.answer(c.id, false)}>
                  Refuser
                </Button>
              </div>
            )}
          </div>
        ))}
        {a.error ? (
          <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {a.error}
          </p>
        ) : null}
      </div>

      {connected ? (
        <footer className="border-t border-border p-2.5">
          <form
            className="flex items-center gap-1 rounded-xl border border-input bg-background p-1 shadow-xs transition focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={a.toggleMic}
              aria-pressed={a.micOn}
              disabled={a.status === "connecting"}
              aria-label={a.micOn ? "Couper le micro" : "Activer le micro"}
              title={a.micOn ? "Couper le micro" : "Activer le micro"}
              className={cn("relative shrink-0 rounded-lg", a.micOn ? "text-success" : "text-muted-foreground")}
            >
              {a.micOn ? (
                <span className="absolute inset-0 rounded-lg bg-success/15 transition-transform duration-75" style={{ transform: `scale(${0.6 + micLevel * 0.4})` }} aria-hidden />
              ) : null}
              {a.micOn ? <Mic /> : <MicOff />}
            </Button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={a.micOn ? "Parlez ou écrivez…" : "Écrire à Eric…"}
              className="h-8 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Message à Eric"
              maxLength={2000}
            />
            <Button type="submit" size="icon-sm" className="shrink-0 rounded-lg" disabled={!draft.trim() || a.status === "connecting"} aria-label="Envoyer">
              {a.status === "connecting" ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Button>
          </form>
        </footer>
      ) : (
        <footer className="flex flex-col gap-2 border-t border-border p-3">
          <Button onClick={start} className="h-10 rounded-xl">
            <Mic /> {a.status === "error" ? "Réessayer" : "Démarrer la conversation"}
          </Button>
          {!consent ? <p className="text-center text-[11px] text-muted-foreground">Votre voix et vos messages sont transmis à Google Gemini pour être traités.</p> : null}
        </footer>
      )}
    </section>
  );
}
