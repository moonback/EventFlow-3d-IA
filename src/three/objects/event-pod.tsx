"use client";

const DAY = 86_400_000;

/** Compte à rebours lisible : « En cours », « Aujourd'hui », « Demain », « J-3 », « Terminé ». */
export function eventCountdown(startAt?: string, endAt?: string, now = new Date()): string | null {
  if (!startAt || !endAt) return null;
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (end <= now) return "Terminé";
  if (start <= now) return "En cours";
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(start) - midnight(now)) / DAY);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Demain";
  return `J-${days}`;
}
