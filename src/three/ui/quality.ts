"use client";
import { useCallback, useEffect, useState } from "react";

export type Quality = "low" | "medium" | "high";
export const QUALITY_LABELS: Record<Quality, string> = { low: "Basse", medium: "Moyenne", high: "Élevée" };

const KEY = "ef_3d_quality";
const EVENT = "ef-3d-quality";

function read(): Quality {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "low" || v === "high" || v === "medium" ? v : "medium";
  } catch {
    return "medium";
  }
}

/**
 * Qualité graphique de la scène 3D, mémorisée dans ce navigateur et partagée entre
 * le monde 3D, l'accueil et le mur d'écrans (synchronisée entre les onglets).
 */
export function useQuality(): [Quality, (q: Quality) => void] {
  const [quality, setQuality] = useState<Quality>("medium");
  useEffect(() => {
    setQuality(read());
    const sync = () => setQuality(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = useCallback((q: Quality) => {
    try {
      window.localStorage.setItem(KEY, q);
    } catch {
      /* stockage indisponible : réglage limité à la session */
    }
    setQuality(q);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [quality, update];
}

// ── Éclairage : heure réelle du site, ou jour / nuit forcés ─────────────

export type Lighting = "auto" | "day" | "night";
export const LIGHTING_LABELS: Record<Lighting, string> = { auto: "Heure réelle", day: "Jour", night: "Nuit" };
const LIGHTING_KEY = "ef_3d_lighting";
const LIGHTING_EVENT = "ef-3d-lighting";

function readLighting(): Lighting {
  try {
    const v = window.localStorage.getItem(LIGHTING_KEY);
    return v === "day" || v === "night" || v === "auto" ? v : "auto";
  } catch {
    return "auto";
  }
}

/** Mode d'éclairage de la scène, mémorisé dans ce navigateur et partagé entre les vues 3D. */
export function useLighting(): [Lighting, (l: Lighting) => void] {
  const [lighting, setLighting] = useState<Lighting>("auto");
  useEffect(() => {
    setLighting(readLighting());
    const sync = () => setLighting(readLighting());
    window.addEventListener(LIGHTING_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LIGHTING_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = useCallback((l: Lighting) => {
    try {
      window.localStorage.setItem(LIGHTING_KEY, l);
    } catch {
      /* stockage indisponible */
    }
    setLighting(l);
    window.dispatchEvent(new Event(LIGHTING_EVENT));
  }, []);
  return [lighting, update];
}
