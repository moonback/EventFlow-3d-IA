"use client";
import { Copy, RotateCw, Scissors, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { PROP_CATALOG, PROP_CATEGORIES } from "@/features/site-plan/catalog";
import { fitOpening, polygonArea, wallLength, wallDir } from "@/features/site-plan/geometry";
import { FLOOR_KINDS, OPENING_KINDS, WALL_MATERIALS, type FloorKind, type OpeningKind, type SitePlan, type WallMaterial } from "@/features/site-plan/schema";
import type { Selection } from "./types";

/** Champ numérique validé à la sortie du champ ou sur Entrée (la saisie en cours n'est jamais écrasée). */
function NumberField({ label, value, onCommit, min, max, step = 0.01, unit = "m", digits = 2 }: { label: string; value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; digits?: number }) {
  const id = useId();
  const shown = String(Math.round(value * 10 ** digits) / 10 ** digits);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    const v = Number(text.replace(",", "."));
    if (!Number.isFinite(v)) return setText(shown);
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    if (clamped !== value) onCommit(clamped);
    setText(String(Math.round(clamped * 10 ** digits) / 10 ** digits));
  };
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={text}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          className="h-7 w-20 rounded-md border border-input bg-background px-2 text-right text-xs tabular-nums"
        />
        <span className="w-6 text-muted-foreground">{unit}</span>
      </span>
    </label>
  );
}

function SelectField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className="h-7 w-[8.5rem] rounded-md border border-input bg-background px-2 text-xs">
        {(Object.keys(options) as T[]).map((k) => (
          <option key={k} value={k}>
            {options[k]}
          </option>
        ))}
      </select>
    </label>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-sm font-semibold">{title}</h3>
    {children}
  </section>
);

interface Props {
  plan: SitePlan;
  selection: Selection;
  onPatch: (key: "walls" | "openings" | "rooms" | "props", id: string, patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRotate: () => void;
  onSplit: () => void;
}

/** Propriétés de l'élément sélectionné, ou résumé du plan si rien n'est sélectionné. */
export function PropertiesPanel({ plan, selection, onPatch, onDelete, onDuplicate, onRotate, onSplit }: Props) {
  const del = (
    <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete} title="Supprimer (Suppr)">
      <Trash2 /> Supprimer
    </Button>
  );

  if (selection?.kind === "wall") {
    const w = plan.walls.find((x) => x.id === selection.id);
    if (!w) return null;
    const len = wallLength(w);
    const [ux, uz] = wallDir(w);
    const openings = plan.openings.filter((o) => o.wallId === w.id).length;
    return (
      <Section title="Mur">
        <NumberField label="Longueur" value={len} min={0.1} max={300} onCommit={(v) => onPatch("walls", w.id, { b: [Math.round((w.a[0] + ux * v) * 1000) / 1000, Math.round((w.a[1] + uz * v) * 1000) / 1000] })} />
        <NumberField label="Épaisseur" value={w.thickness} min={0.05} max={1.5} onCommit={(v) => onPatch("walls", w.id, { thickness: v })} />
        <NumberField label="Hauteur" value={w.height} min={0.5} max={20} onCommit={(v) => onPatch("walls", w.id, { height: v })} />
        <SelectField label="Matériau" value={w.material} options={WALL_MATERIALS} onChange={(v: WallMaterial) => onPatch("walls", w.id, { material: v })} />
        <p className="text-[11px] text-muted-foreground">
          {openings} ouverture(s) · glisser une extrémité pour l&apos;allonger (Alt : la détacher des murs voisins)
        </p>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={onSplit} title="Couper le mur en son milieu (pour y raccorder un autre mur)">
            <Scissors /> Couper
          </Button>
          {del}
        </div>
      </Section>
    );
  }

  if (selection?.kind === "opening") {
    const o = plan.openings.find((x) => x.id === selection.id);
    const w = o && plan.walls.find((x) => x.id === o.wallId);
    if (!o || !w) return null;
    const len = wallLength(w);
    return (
      <Section title={OPENING_KINDS[o.kind]}>
        <SelectField
          label="Type"
          value={o.kind}
          options={OPENING_KINDS}
          onChange={(kind: OpeningKind) => onPatch("openings", o.id, { kind, sill: kind === "window" ? Math.max(o.sill, 0.3) : 0, height: kind === "window" ? Math.min(o.height, w.height - Math.max(o.sill, 0.3)) : Math.min(Math.max(o.height, 2.1), w.height) })}
        />
        <NumberField label="Largeur" value={o.width} min={0.3} max={Math.min(20, len)} onCommit={(v) => onPatch("openings", o.id, { width: v, offset: fitOpening(len, o.offset, v) ?? o.offset })} />
        <NumberField label="Hauteur" value={o.height} min={0.3} max={w.height - o.sill} onCommit={(v) => onPatch("openings", o.id, { height: v })} />
        <NumberField label="Allège" value={o.sill} min={0} max={Math.max(0, w.height - o.height)} onCommit={(v) => onPatch("openings", o.id, { sill: v })} />
        <NumberField label="Depuis le début du mur" value={o.offset - o.width / 2} min={0} max={len - o.width} onCommit={(v) => onPatch("openings", o.id, { offset: fitOpening(len, v + o.width / 2, o.width) ?? o.offset })} />
        <div>{del}</div>
      </Section>
    );
  }

  if (selection?.kind === "room") {
    const r = plan.rooms.find((x) => x.id === selection.id);
    if (!r) return null;
    return (
      <Section title="Pièce">
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">Nom</span>
          <input
            key={r.id}
            defaultValue={r.name}
            maxLength={60}
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== r.name && onPatch("rooms", r.id, { name: e.target.value.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="h-7 w-[8.5rem] rounded-md border border-input bg-background px-2 text-xs"
          />
        </label>
        <SelectField label="Revêtement" value={r.floor} options={FLOOR_KINDS} onChange={(v: FloorKind) => onPatch("rooms", r.id, { floor: v })} />
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">Toit</span>
          <input type="checkbox" checked={Boolean(r.roofHeight)} onChange={(e) => onPatch("rooms", r.id, { roofHeight: e.target.checked ? 3 : null })} className="size-4 accent-primary" />
        </label>
        {r.roofHeight ? <NumberField label="Hauteur du toit" value={r.roofHeight} min={1} max={25} onCommit={(v) => onPatch("rooms", r.id, { roofHeight: v })} /> : null}
        <p className="text-xs">
          Surface : <strong className="tabular-nums">{polygonArea(r.polygon).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m²</strong> · {r.polygon.length} sommets
        </p>
        <div>{del}</div>
      </Section>
    );
  }

  if (selection?.kind === "prop") {
    const p = plan.props.find((x) => x.id === selection.id);
    if (!p) return null;
    const def = PROP_CATALOG[p.type];
    const dims = ["Largeur", "Hauteur", "Profondeur"] as const;
    return (
      <Section title={def.label}>
        <p className="-mt-1 text-[11px] text-muted-foreground">{PROP_CATEGORIES[def.category]}</p>
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">Étiquette</span>
          <input
            key={p.id}
            defaultValue={p.label ?? ""}
            placeholder={def.label}
            maxLength={60}
            onBlur={(e) => (e.target.value.trim() || null) !== (p.label ?? null) && onPatch("props", p.id, { label: e.target.value.trim() || null })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="h-7 w-[8.5rem] rounded-md border border-input bg-background px-2 text-xs"
          />
        </label>
        <NumberField label="Position x (est)" value={p.position[0]} min={-150} max={150} onCommit={(v) => onPatch("props", p.id, { position: [v, p.position[1]] })} />
        <NumberField label="Position z (sud)" value={p.position[1]} min={-150} max={150} onCommit={(v) => onPatch("props", p.id, { position: [p.position[0], v] })} />
        <NumberField label="Élévation" value={p.elevation} min={0} max={20} onCommit={(v) => onPatch("props", p.id, { elevation: v })} />
        <NumberField label="Rotation" value={(((p.rotationY * 180) / Math.PI) % 360 + 360) % 360} min={0} max={359.9} step={15} unit="°" digits={1} onCommit={(v) => onPatch("props", p.id, { rotationY: (v * Math.PI) / 180 })} />
        {dims.map((label, k) => (
          <NumberField key={label} label={label} value={p.size[k]!} min={def.min[k]} max={def.max[k]} onCommit={(v) => onPatch("props", p.id, { size: p.size.map((s, i) => (i === k ? v : s)) })} />
        ))}
        {def.colorable ? (
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Couleur</span>
            <span className="flex items-center gap-1">
              <input type="color" value={p.color ?? def.color} onChange={(e) => onPatch("props", p.id, { color: e.target.value })} className="h-7 w-10 cursor-pointer rounded border border-input bg-background" />
              {p.color ? (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onPatch("props", p.id, { color: null })}>
                  Défaut
                </Button>
              ) : null}
            </span>
          </label>
        ) : null}
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={onRotate} title="Tourner de 90° (R)">
            <RotateCw /> Tourner
          </Button>
          <Button size="sm" variant="ghost" onClick={onDuplicate} title="Dupliquer (Ctrl+D)">
            <Copy /> Dupliquer
          </Button>
          {del}
        </div>
      </Section>
    );
  }

  const area = plan.rooms.reduce((s, r) => s + polygonArea(r.polygon), 0);
  return (
    <Section title="Plan du site">
      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
        <li>
          {plan.walls.length} mur(s) · {plan.openings.length} ouverture(s)
        </li>
        <li>
          {plan.rooms.length} pièce(s) · {area.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m² au total
        </li>
        <li>{plan.props.length} accessoire(s)</li>
      </ul>
      <p className="text-[11px] text-muted-foreground">Sélectionnez un élément pour le configurer. Les objets métier (rayonnages, véhicules, postes) apparaissent en gris : ils se déplacent avec le bouton « Agencer » du monde 3D.</p>
    </Section>
  );
}
