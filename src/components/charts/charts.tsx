"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const euro = (v: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const monthLabel = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1] ?? m;

const tooltipStyle = { background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-popover-foreground)", fontSize: 12 };

/** Série mensuelle : facturé HT, encaissé TTC, dépenses HT (valeurs reçues en chaînes décimales). */
export function MonthlyFinanceChart({ data }: { data: { month: string; invoiced: string; collected: string; expenses: string }[] }) {
  const rows = data.map((d) => ({ month: monthLabel(d.month), Facturé: Number(d.invoiced), Encaissé: Number(d.collected), Dépenses: Number(d.expenses) }));
  return (
    <div className="h-64 w-full" role="img" aria-label="Graphique mensuel du chiffre d'affaires facturé, des encaissements et des dépenses">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="month" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
          <Tooltip formatter={(v) => euro(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Facturé" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Encaissé" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Dépenses" fill="var(--color-warning)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#a855f7", "#14b8a6", "#f97316", "#64748b", "#ef4444", "#84cc16"];

export function DonutChart({ data, valueFormat = "number" }: { data: { name: string; value: number }[]; valueFormat?: "number" | "money" }) {
  return (
    <div className="h-56 w-full" role="img" aria-label="Répartition">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => (valueFormat === "money" ? euro(Number(v)) : String(v))} contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleBarChart({ data, dataKey, label, valueFormat = "number" }: { data: Record<string, string | number>[]; dataKey: string; label: string; valueFormat?: "number" | "money" | "percent" }) {
  const fmt = (v: number) => (valueFormat === "money" ? euro(v) : valueFormat === "percent" ? `${v} %` : String(v));
  return (
    <div className="h-64 w-full" role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
          <XAxis type="number" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmt(v)} />
          <YAxis type="category" dataKey="name" width={140} tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} />
          <Bar dataKey={dataKey} name={label} fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendLineChart({ data, keys }: { data: Record<string, string | number>[]; keys: { key: string; label: string; color: string }[] }) {
  return (
    <div className="h-56 w-full" role="img" aria-label="Évolution">
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
          <Tooltip contentStyle={tooltipStyle} />
          {keys.map((k) => (
            <Line key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Mini-courbe décorative d'un indicateur (sans axes) ; la valeur exacte est affichée à côté. */
export function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  const id = `spark-${label.replace(/[^a-z0-9]/gi, "")}`;
  const rows = values.map((v, i) => ({ i, v }));
  return (
    <div className="h-8 w-16 xl:w-20" role="img" aria-label={label}>
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
