"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ASSISTANT_WS_PATH, CLOSE_CODES, MAX_WORLD_RESULT_CHARS, type ClientMessage, type ConfirmOutcome, type ServerMessage } from "@/features/assistant/protocol";
import { findWorldTool, type WorldResult } from "@/features/assistant/world-tools";
import { desktopAssistantWsUrl } from "@/lib/desktop";
import { startMicrophone, type Microphone } from "./audio/microphone";
import { VoicePlayer } from "./audio/player";

const RECONNECTING = "Connexion perdue, reconnexion…";

export type AssistantStatus = "idle" | "connecting" | "listening" | "speaking" | "error";

/** Exécute une commande de scène demandée par Eric (implémenté par le monde 3D). */
export type WorldBridge = (name: string, args: Record<string, unknown>) => Promise<WorldResult>;

/** Action proposée par Eric, en attente du clic de l'utilisateur (puis son issue, affichée brièvement). */
export interface PendingConfirmation {
  id: string;
  title: string;
  details: string[];
  danger: boolean;
  expiresAt: number;
  outcome?: { kind: ConfirmOutcome; message: string };
}

export interface TranscriptLine {
  id: number;
  role: "user" | "eric";
  text: string;
}

/**
 * URL de la passerelle vocale :
 * 1. application de bureau (Electron) : la passerelle écoute un port local propre, communiqué par le pont ;
 * 2. développement web : variable publique `NEXT_PUBLIC_ASSISTANT_WS_URL` (port distinct de Next) ;
 * 3. production web : même origine que l'application (le proxy inverse route /ws/assistant).
 */
export async function assistantSocketUrl() {
  const fromDesktop = await desktopAssistantWsUrl();
  if (fromDesktop) return fromDesktop;
  const configured = process.env.NEXT_PUBLIC_ASSISTANT_WS_URL;
  if (configured) return configured;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${ASSISTANT_WS_PATH}`;
}

/** Fermetures dues au réseau ou à un redémarrage de la passerelle : reconnexion automatique */
const RETRYABLE_CLOSES = new Set([1001, 1006, 1011, 1012]);
const MAX_RETRIES = 3;

const CLOSE_MESSAGES: Record<number, string> = {
  1006: "La connexion avec Eric a été coupée",
  [CLOSE_CODES.REPLACED]: "La conversation a été ouverte dans un autre onglet",
};

/**
 * Conversation vocale avec Eric : WebSocket vers la passerelle, micro (PCM 16 kHz), lecture de la
 * voix (PCM 24 kHz), transcription en direct et saisie au clavier dans la même conversation.
 */
export function useAssistant(bridge?: WorldBridge, onDataChanged?: () => void) {
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [micOn, setMicOn] = useState(false);
  /** Données consultées en ce moment (« le stock », « les événements »…) */
  const [activity, setActivity] = useState<string | null>(null);
  const [confirmations, setConfirmations] = useState<PendingConfirmation[]>([]);

  const socket = useRef<WebSocket | null>(null);
  const player = useRef<VoicePlayer | null>(null);
  const mic = useRef<Microphone | null>(null);
  const micLevelRef = useRef(0);
  const ready = useRef(false);
  const lastError = useRef<string | null>(null);
  /** Locuteur du tour en cours : un nouveau fragment du même locuteur complète sa ligne */
  const openRole = useRef<"user" | "eric" | null>(null);
  const lineId = useRef(0);
  const runningTools = useRef(new Map<string, string>());
  const retries = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<() => Promise<void>>(async () => undefined);
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;
  const onDataChangedRef = useRef(onDataChanged);
  onDataChangedRef.current = onDataChanged;

  const send = useCallback((message: ClientMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message));
  }, []);

  const stopMic = useCallback(() => {
    mic.current?.stop();
    mic.current = null;
    micLevelRef.current = 0;
    setMicOn(false);
  }, []);

  const startMic = useCallback(async () => {
    if (mic.current) return;
    try {
      mic.current = await startMicrophone((frame, level) => {
        micLevelRef.current = level;
        if (ready.current && socket.current?.readyState === WebSocket.OPEN) socket.current.send(frame);
      });
      setMicOn(true);
    } catch {
      setError("Micro indisponible ou refusé : vous pouvez écrire à Eric ci-dessous");
    }
  }, []);

  const teardown = useCallback(() => {
    stopMic();
    player.current?.close();
    player.current = null;
    ready.current = false;
    openRole.current = null;
    runningTools.current.clear();
    setActivity(null);
    setConfirmations([]);
    const ws = socket.current;
    socket.current = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close(1000);
  }, [stopMic]);

  const appendTranscript = useCallback((role: "user" | "eric", text: string) => {
    setLines((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && openRole.current === role) {
        return [...prev.slice(0, -1), { ...last, text: last.text + text }];
      }
      openRole.current = role;
      return [...prev.slice(-49), { id: ++lineId.current, role, text: text.trimStart() }];
    });
  }, []);

  /** Exécute une commande de scène ; ne lève jamais (le résultat repart toujours vers Eric). */
  const runWorldCall = useCallback(async (name: string, args: Record<string, unknown>): Promise<WorldResult> => {
    const tool = findWorldTool(name);
    if (!tool) return { ok: false, error: "UNKNOWN_TOOL", message: `Commande inconnue : ${name}` };
    const parsed = tool.input.safeParse(args);
    if (!parsed.success) return { ok: false, error: "INVALID_ARGUMENTS", message: parsed.error.issues.map((i) => i.message).join(" ; ") };
    if (!bridgeRef.current) return { ok: false, error: "UNAVAILABLE", message: "Le monde 3D n'est pas affiché" };
    try {
      const result = await bridgeRef.current(name, parsed.data as Record<string, unknown>);
      return JSON.stringify(result).length <= MAX_WORLD_RESULT_CHARS ? result : { ok: result.ok, ...(result.ok ? {} : { error: result.error, message: result.message }) } as WorldResult;
    } catch (e) {
      return { ok: false, error: "FAILED", message: e instanceof Error ? e.message : "Commande de scène impossible" };
    }
  }, []);

  const onServerMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case "state":
          ready.current = message.state === "ready";
          if (message.state === "ready") {
            retries.current = 0;
            lastError.current = null;
            setError((e) => (e === RECONNECTING ? null : e));
            setStatus("listening");
            void startMic();
          } else setStatus("connecting");
          break;
        case "transcript":
          appendTranscript(message.role, message.text);
          break;
        case "interrupted":
          player.current?.flush();
          openRole.current = null;
          break;
        case "turn_complete":
          openRole.current = null;
          break;
        case "tool":
          if (message.state === "running") runningTools.current.set(message.id, message.label);
          else runningTools.current.delete(message.id);
          setActivity([...runningTools.current.values()].at(-1) ?? null);
          break;
        case "confirm_request":
          setConfirmations((prev) => [...prev.filter((c) => c.id !== message.id), { id: message.id, title: message.title, details: message.details, danger: message.danger, expiresAt: Date.now() + message.expiresInSec * 1000 }]);
          break;
        case "confirm_closed":
          setConfirmations((prev) => prev.map((c) => (c.id === message.id ? { ...c, outcome: { kind: message.outcome, message: message.message } } : c)));
          // L'issue reste affichée quelques secondes, puis la carte disparaît
          setTimeout(() => setConfirmations((prev) => prev.filter((c) => c.id !== message.id)), 4000);
          if (message.outcome === "done") onDataChangedRef.current?.();
          break;
        case "world_call":
          void runWorldCall(message.name, message.args).then((result) => send({ type: "world_result", id: message.id, result }));
          break;
        case "error":
          lastError.current = message.message;
          setError(message.message);
          break;
      }
    },
    [appendTranscript, runWorldCall, send, startMic],
  );

  const start = useCallback(async () => {
    if (socket.current) return;
    setError(null);
    lastError.current = null;
    setStatus("connecting");
    // Création et reprise de l'AudioContext pendant le clic (politique d'autoplay)
    const voice = new VoicePlayer();
    player.current = voice;
    await voice.resume();
    const ws = new WebSocket(await assistantSocketUrl());
    ws.binaryType = "arraybuffer";
    socket.current = ws;
    let opened = false;
    ws.onopen = () => {
      opened = true;
    };
    ws.onmessage = (e: MessageEvent<ArrayBuffer | string>) => {
      if (typeof e.data === "string") {
        try {
          onServerMessage(JSON.parse(e.data) as ServerMessage);
        } catch {
          // message illisible : ignoré
        }
      } else player.current?.enqueue(e.data);
    };
    ws.onclose = (e) => {
      if (socket.current !== ws) return; // conversation déjà terminée côté client
      teardown();
      if (e.code === 1000 || e.code === CLOSE_CODES.HANGUP) setStatus("idle");
      else if (opened && RETRYABLE_CLOSES.has(e.code) && retries.current < MAX_RETRIES) {
        // Coupure réseau : nouvelle conversation après 1 s, 2 s puis 4 s (la transcription est conservée)
        const delay = 1000 * 2 ** retries.current++;
        setStatus("connecting");
        setError(RECONNECTING);
        retryTimer.current = setTimeout(() => void startRef.current(), delay);
      } else {
        setStatus("error");
        // Upgrade refusé (session, permission, assistant désactivé) ou passerelle arrêtée : jamais ouvert
        const fallback = opened ? CLOSE_MESSAGES[e.code] : "Impossible de joindre Eric : assistant désactivé, accès refusé ou passerelle arrêtée";
        setError(lastError.current ?? fallback ?? "La conversation avec Eric s'est interrompue");
      }
    };
  }, [onServerMessage, teardown]);
  startRef.current = start;

  const clearRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    retries.current = 0;
  }, []);

  const stop = useCallback(() => {
    clearRetry();
    send({ type: "hangup" });
    teardown();
    setStatus("idle");
  }, [clearRetry, send, teardown]);

  const toggleMic = useCallback(() => {
    if (mic.current) {
      stopMic();
      send({ type: "audio_end" });
    } else void startMic();
  }, [send, startMic, stopMic]);

  const sendText = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || !socket.current) return;
      player.current?.flush();
      openRole.current = null;
      setLines((prev) => [...prev.slice(-49), { id: ++lineId.current, role: "user", text: t }]);
      send({ type: "text", text: t });
    },
    [send],
  );

  /** Réponse de l'utilisateur à une action proposée (seul un clic peut confirmer). */
  const answer = useCallback(
    (id: string, approved: boolean) => {
      setConfirmations((prev) => prev.map((c) => (c.id === id ? { ...c, outcome: { kind: approved ? "done" : "cancelled", message: approved ? "Exécution…" : "Refusé" } } : c)));
      send({ type: "confirm_answer", id, approved });
    },
    [send],
  );

  /** Amplitude de la voix d'Eric (0..1), lue à chaque image par l'avatar. */
  const voiceLevel = useCallback(() => player.current?.level() ?? 0, []);
  /** Niveau du micro (0..1) : lu par le panneau à son rythme, sans faire re-rendre la scène. */
  const micLevel = useCallback(() => (mic.current ? Math.min(1, micLevelRef.current * 4) : 0), []);

  // Eric parle-t-il ? (React ignore la mise à jour quand l'état ne change pas)
  const active = status === "listening" || status === "speaking";
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      // Mise à jour fonctionnelle : ne remplace pas un état « connecting » arrivé entre-temps
      setStatus((s) => (s === "listening" || s === "speaking" ? (player.current?.speaking ? "speaking" : "listening") : s));
    }, 100);
    return () => clearInterval(t);
  }, [active]);

  useEffect(
    () => () => {
      clearRetry();
      teardown();
    },
    [clearRetry, teardown],
  );

  return { status, error, lines, micOn, micLevel, activity, confirmations, answer, start, stop, toggleMic, sendText, voiceLevel };
}
