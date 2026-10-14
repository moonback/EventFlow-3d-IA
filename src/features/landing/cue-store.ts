"use client";
import { useSyncExternalStore } from "react";

/**
 * Cue actif partagé entre la conduite (défilement) et le plateau 3D.
 * -1 = avant-show (page d'ouverture), 0..n = cues de la conduite.
 */
let active = -1;
const listeners = new Set<() => void>();

export function setActiveCue(index: number) {
  if (index === active) return;
  active = index;
  for (const l of listeners) l();
}

export function getActiveCue() {
  return active;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActiveCue() {
  return useSyncExternalStore(subscribe, getActiveCue, () => -1);
}
