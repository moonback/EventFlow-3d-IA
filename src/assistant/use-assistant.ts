"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ASSISTANT_WS_PATH, CLOSE_CODES, type ClientMessage, type ServerMessage } from "@/features/assistant/protocol";
import { startMicrophone, type Microphone } from "./audio/microphone";
import { VoicePlayer } from "./audio/player";

export type AssistantStatus = "idle" | "connecting" | "listening" | "speaking" | "error";

export interface TranscriptLine {
  id: number;
  role: "user" | "eric";
  text: string;
}

/** URL de la passerelle : variable publique en développement (port distinct), sinon même origine. */
export function assistantSocketUrl() {
  const configured = process.env.NEXT_PUBLIC_ASSISTANT_WS_URL;
  if (configured) return configured;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${ASSISTANT_WS_PATH}`;
}

const CLOSE_MESSAGES: Record<number, string> = {
  1006: "La connexion avec Eric a été coupée",
  [CLOSE_CODES.REPLACED]: "La conversation a été ouverte dans un autre onglet",
};

/**
 * Conversation vocale avec Eric : WebSocket vers la passerelle, micro (PCM 16 kHz), lecture de la
 * voix (PCM 24 kHz), transcription en direct et saisie au clavier dans la même conversation.
 */
export function useAssistant() {
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const socket = useRef<WebSocket | null>(null);
  const player = useRef<VoicePlayer | null>(null);
  const mic = useRef<Microphone | null>(null);
  const micLevelRef = useRef(0);
  const ready = useRef(false);
  const lastError = useRef<string | null>(null);
  /** Locuteur du tour en cours : un nouveau fragment du même locuteur complète sa ligne */
  const openRole = useRef<"user" | "eric" | null>(null);
  const lineId = useRef(0);

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

  const onServerMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case "state":
          ready.current = message.state === "ready";
          if (message.state === "ready") {
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
        case "error":
          lastError.current = message.message;
          setError(message.message);
          break;
      }
    },
    [appendTranscript, startMic],
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
    const ws = new WebSocket(assistantSocketUrl());
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
      else {
        setStatus("error");
        // Upgrade refusé (session, permission, assistant désactivé) ou passerelle arrêtée : jamais ouvert
        const fallback = opened ? CLOSE_MESSAGES[e.code] : "Impossible de joindre Eric : assistant désactivé, accès refusé ou passerelle arrêtée";
        setError(lastError.current ?? fallback ?? "La conversation avec Eric s'est interrompue");
      }
    };
  }, [onServerMessage, teardown]);

  const stop = useCallback(() => {
    send({ type: "hangup" });
    teardown();
    setStatus("idle");
  }, [send, teardown]);

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

  /** Amplitude de la voix d'Eric (0..1), lue à chaque image par l'avatar. */
  const voiceLevel = useCallback(() => player.current?.level() ?? 0, []);

  // Boucle d'affichage : Eric parle-t-il ? niveau du micro (≈ 15 rafraîchissements par seconde)
  const active = status === "listening" || status === "speaking";
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      setStatus(player.current?.speaking ? "speaking" : "listening");
      setMicLevel(Math.round(Math.min(1, micLevelRef.current * 4) * 20) / 20);
    }, 66);
    return () => clearInterval(t);
  }, [active]);

  useEffect(() => teardown, [teardown]);

  return { status, error, lines, micOn, micLevel, start, stop, toggleMic, sendText, voiceLevel };
}
