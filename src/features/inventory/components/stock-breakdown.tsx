import type { StockSummary } from "@/server/services/inventory-service";

const ITEMS: { key: keyof StockSummary; label: string; cls: string }[] = [
  { key: "availableNow", label: "Disponible", cls: "text-success" },
  { key: "reserved", label: "Réservé", cls: "text-primary" },
  { key: "inPreparation", label: "En préparation", cls: "text-warning" },
  { key: "inTransit", label: "Sorti / transit", cls: "text-info" },
  { key: "inReturn", label: "En retour", cls: "text-muted-foreground" },
  { key: "damaged", label: "Endommagé", cls: "text-destructive" },
  { key: "inMaintenance", label: "Maintenance", cls: "text-destructive" },
  { key: "total", label: "Total possédé", cls: "text-foreground" },
];

export function StockBreakdown({ summary, compact }: { summary: StockSummary; compact?: boolean }) {
  return (
    <dl className={compact ? "grid grid-cols-4 gap-2" : "grid grid-cols-2 gap-3 sm:grid-cols-4"}>
      {ITEMS.map((i) => (
        <div key={i.key} className="rounded-lg border border-border p-2.5">
          <dt className="text-[11px] text-muted-foreground">{i.label}</dt>
          <dd className={`text-lg font-semibold tabular-nums ${i.cls}`}>{summary[i.key]}</dd>
        </div>
      ))}
    </dl>
  );
}
