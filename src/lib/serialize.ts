import type { DecimalInput } from "./money";
import { round2, dec } from "./money";

/** Montant Decimal → chaîne "1234.50" (DTO sérialisable vers le navigateur). */
export function money(value: DecimalInput | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return round2(value).toFixed(2);
}

export function moneyOrZero(value: DecimalInput | null | undefined): string {
  return money(value) ?? "0.00";
}

/** Decimal non monétaire (poids, volume, quantités décimales) → chaîne normalisée. */
export function decimalString(value: DecimalInput | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return dec(value).toString();
}

export function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}
