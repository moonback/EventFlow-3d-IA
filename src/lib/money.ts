import Decimal from "decimal.js";

/**
 * Calculs monétaires — jamais de nombres flottants JavaScript pour les montants.
 * Toutes les valeurs sont manipulées en Decimal (decimal.js) et arrondies au centime
 * (arrondi commercial « half up ») aux étapes documentées dans docs/BUSINESS_RULES.md.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type DecimalValue = InstanceType<typeof D>;
export type DecimalInput = DecimalValue | string | number | { toString(): string };

export function dec(value: DecimalInput | null | undefined): DecimalValue {
  if (value === null || value === undefined || value === "") return new D(0);
  if (value instanceof D) return value;
  return new D(typeof value === "number" ? value : value.toString());
}

export function round2(value: DecimalInput): DecimalValue {
  return dec(value).toDecimalPlaces(2, D.ROUND_HALF_UP);
}

/** Représentation canonique "1234.50" (stockage / API). */
export function toMoneyString(value: DecimalInput): string {
  return round2(value).toFixed(2);
}

export function formatMoney(value: DecimalInput | null | undefined, currency = "EUR", locale = "fr-FR"): string {
  if (value === null || value === undefined) return "—";
  const fixed = round2(value).toFixed(2);
  // Intl formate à partir d'une chaîne décimale exacte (pas de perte de précision)
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    fixed as unknown as number,
  );
}

export function formatPercent(value: DecimalInput, locale = "fr-FR"): string {
  return `${dec(value).toDecimalPlaces(2).toNumber().toLocaleString(locale)} %`;
}

export interface LineInput {
  quantity: DecimalInput;
  days?: DecimalInput;
  unitPrice: DecimalInput;
  discountPercent?: DecimalInput;
  vatRate: DecimalInput;
}

export interface VatBreakdown {
  rate: string;
  base: string;
  tax: string;
}

export interface DocumentTotals {
  lineTotals: string[];
  subtotalExclTax: string;
  globalDiscountAmount: string;
  totalExclTax: string;
  vat: VatBreakdown[];
  totalTax: string;
  totalInclTax: string;
}

/** Total HT d'une ligne : quantité × jours × PU × (1 − remise %), arrondi au centime. */
export function computeLineTotal(line: LineInput): DecimalValue {
  const quantity = dec(line.quantity);
  const days = line.days === undefined ? new D(1) : dec(line.days);
  const discount = dec(line.discountPercent ?? 0);
  if (quantity.isNegative() || days.isNegative() || dec(line.unitPrice).isNegative()) {
    throw new RangeError("Quantités, jours et prix unitaires doivent être positifs");
  }
  if (discount.lt(0) || discount.gt(100)) throw new RangeError("Remise hors limites (0-100 %)");
  return round2(quantity.mul(days).mul(dec(line.unitPrice)).mul(new D(100).minus(discount)).div(100));
}

/**
 * Totaux d'un devis / d'une facture.
 * 1. Total HT de chaque ligne arrondi au centime.
 * 2. Sous-total = somme des lignes ; remise globale = sous-total × % arrondi au centime.
 * 3. Base de TVA par taux = part de la remise globale répartie au prorata, l'écart d'arrondi
 *    étant affecté au dernier taux pour que la somme des bases égale le total HT.
 * 4. TVA par taux = base × taux arrondi au centime ; TTC = HT + somme des TVA.
 */
export function computeDocumentTotals(lines: LineInput[], globalDiscountPercent: DecimalInput = 0): DocumentTotals {
  const gd = dec(globalDiscountPercent);
  if (gd.lt(0) || gd.gt(100)) throw new RangeError("Remise globale hors limites (0-100 %)");

  const lineTotals = lines.map(computeLineTotal);
  const subtotal = lineTotals.reduce((acc, v) => acc.plus(v), new D(0));
  const globalDiscountAmount = round2(subtotal.mul(gd).div(100));
  const totalExclTax = subtotal.minus(globalDiscountAmount);

  const byRate = new Map<string, DecimalValue>();
  lines.forEach((line, i) => {
    const rate = dec(line.vatRate).toFixed(2);
    byRate.set(rate, (byRate.get(rate) ?? new D(0)).plus(lineTotals[i]!));
  });
  const rates = [...byRate.keys()].sort((a, b) => dec(a).comparedTo(dec(b)));

  const vat: VatBreakdown[] = [];
  let allocated = new D(0);
  rates.forEach((rate, index) => {
    const raw = byRate.get(rate)!;
    const base =
      index === rates.length - 1
        ? totalExclTax.minus(allocated)
        : round2(raw.mul(new D(100).minus(gd)).div(100));
    allocated = allocated.plus(base);
    const tax = round2(base.mul(dec(rate)).div(100));
    vat.push({ rate, base: base.toFixed(2), tax: tax.toFixed(2) });
  });

  const totalTax = vat.reduce((acc, v) => acc.plus(v.tax), new D(0));
  return {
    lineTotals: lineTotals.map((v) => v.toFixed(2)),
    subtotalExclTax: subtotal.toFixed(2),
    globalDiscountAmount: globalDiscountAmount.toFixed(2),
    totalExclTax: totalExclTax.toFixed(2),
    vat,
    totalTax: totalTax.toFixed(2),
    totalInclTax: totalExclTax.plus(totalTax).toFixed(2),
  };
}

export function sumMoney(values: DecimalInput[]): DecimalValue {
  return values.reduce<DecimalValue>((acc, v) => acc.plus(dec(v)), new D(0));
}
