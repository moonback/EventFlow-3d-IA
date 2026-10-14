"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Active les animations de la scène (balises, flux, anneaux). Désactivé en qualité basse ou quand
 * l'utilisateur préfère un mouvement réduit : la scène repasse alors en rendu à la demande.
 */
export const MotionContext = createContext(true);
export const useMotion = () => useContext(MotionContext);

// ── Choix des animations, une par une ────────────────────────────────

export type AnimationKey = "flows" | "arcs" | "fleet" | "prep" | "links" | "decor" | "beacons" | "pulses" | "blink";

export const ANIMATIONS: { key: AnimationKey; label: string; effect: string }[] = [
  { key: "flows", label: "Flux de matériel au sol", effect: "masqués" },
  { key: "arcs", label: "Arcs du centre de contrôle", effect: "masqués" },
  { key: "fleet", label: "Chariots et transpalette", effect: "stationnés" },
  { key: "prep", label: "Caisses de la préparation", effect: "masquées" },
  { key: "links", label: "Liens événement ↔ ressources", effect: "figés" },
  { key: "decor", label: "Hologramme et faisceaux de scène", effect: "figés" },
  { key: "beacons", label: "Balises d'alerte", effect: "figées" },
  { key: "pulses", label: "Anneaux et halos pulsés", effect: "figés" },
  { key: "blink", label: "Clignotements (courrier, gyrophares)", effect: "figés" },
];

export type AnimationSettings = Record<AnimationKey, boolean>;
const ALL_ON = Object.fromEntries(ANIMATIONS.map((a) => [a.key, true])) as AnimationSettings;
const KEY = "ef_3d_animations";
const EVENT = "ef-3d-animations";

function read(): AnimationSettings {
  try {
    const stored = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<AnimationSettings>;
    return { ...ALL_ON, ...stored };
  } catch {
    return ALL_ON;
  }
}

/** Animations choisies par l'utilisateur, mémorisées dans ce navigateur et partagées entre les vues 3D. */
export function useAnimationSettings(): [AnimationSettings, (next: AnimationSettings) => void] {
  const [settings, setSettings] = useState<AnimationSettings>(ALL_ON);
  useEffect(() => {
    setSettings(read());
    const sync = () => setSettings(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = useCallback((next: AnimationSettings) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* stockage indisponible : réglage limité à la session */
    }
    setSettings(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [settings, update];
}

export const AnimationContext = createContext<{ settings: AnimationSettings; reduced: boolean }>({ settings: ALL_ON, reduced: false });

/** Animation continue (rendu permanent) : coupée en qualité basse, en mouvement réduit ou par l'utilisateur. */
export function useAnimation(key: AnimationKey) {
  const motion = useMotion();
  const { settings } = useContext(AnimationContext);
  return motion && settings[key];
}

/** Animation légère (rendu à la demande, aussi en qualité basse) : coupée en mouvement réduit ou par l'utilisateur. */
export function useLightAnimation(key: AnimationKey) {
  const { settings, reduced } = useContext(AnimationContext);
  return !reduced && settings[key];
}

/** Élément affiché seulement si l'utilisateur ne l'a pas retiré (indépendant de la qualité). */
export function useAnimationShown(key: AnimationKey) {
  return useContext(AnimationContext).settings[key];
}
