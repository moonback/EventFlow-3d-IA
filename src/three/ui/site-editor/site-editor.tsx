"use client";
import { AppWindow, Armchair, Box, BrickWall, DoorOpen, Map as MapIcon, Maximize, MousePointer2, Redo2, RotateCcw, Save, SquareDashed, TriangleAlert, Undo2, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { SceneData } from "@/features/scene/types";
import { PROP_CATALOG, PROP_CATEGORIES, type PropCategory, type PropType } from "@/features/site-plan/catalog";
import { defaultSitePlan } from "@/features/site-plan/default-plan";
import { planBounds, wallLength, type Vec2 } from "@/features/site-plan/geometry";
import { commit, duplicateProp, initHistory, redo, removeElements, splitWall as splitWallAt, translateWall, undo, updateElement, type History } from "@/features/site-plan/history";
import { sitePlanSchema, type SitePlan } from "@/features/site-plan/schema";
import { ApiError, apiFetch, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { PlanCanvas } from "./plan-canvas";
import { PropertiesPanel } from "./properties-panel";
import { TOOLS, type Selection, type Tool, type View } from "./types";

const TOOL_ICONS: Record<Tool, LucideIcon> = { select: MousePointer2, wall: BrickWall, room: SquareDashed, door: DoorOpen, window: AppWindow, prop: Armchair };
const GRIDS: { value: number | null; label: string }[] = [
  { value: 0.1, label: "10 cm" },
  { value: 0.5, label: "50 cm" },
  { value: 1, label: "1 m" },
  { value: null, label: "Libre" },
];

/** Cadre la vue sur le plan et les objets métier (marge de 6 m). */
function fitView(plan: SitePlan, items: SceneData["items"]): View {
  const b = planBounds(plan);
  const xs = [...items.map((i) => i.position[0]), ...(b ? [b.minX, b.maxX] : [])];
  const zs = [...items.map((i) => i.position[2]), ...(b ? [b.minZ, b.maxZ] : [])];
  if (!xs.length) return { x: -30, y: -20, w: 60, h: 40 };
  const minX = Math.min(...xs) - 6;
  const minZ = Math.min(...zs) - 6;
  return { x: minX, y: minZ, w: Math.max(10, Math.max(...xs) + 6 - minX), h: Math.max(10, Math.max(...zs) + 6 - minZ) };
}

/** Premier problème bloquant du plan, en français, ou null s'il est valide. */
function planIssue(plan: SitePlan): string | null {
  const r = sitePlanSchema.safeParse(plan);
  if (r.success) return null;
  const issue = r.error.issues[0]!;
  const [group, index] = issue.path as [string, number];
  const name = { walls: "Mur", openings: "Ouverture", rooms: "Pièce", props: "Accessoire" }[group] ?? "Élément";
  return `${name}${typeof index === "number" ? ` n° ${index + 1}` : ""} : ${issue.message}`;
}

interface Props {
  data: SceneData;
  onClose: () => void;
  /** Recharge la scène après un enregistrement (le monde 3D affiche alors le nouveau plan). */
  onSaved: () => Promise<void> | void;
  /** Aperçu 3D du brouillon, rendu par la vraie scène. */
  renderPreview: (plan: SitePlan) => ReactNode;
}

/**
 * Éditeur du plan du site : tracé des murs, ouvertures, pièces et pose d'accessoires sur un plan 2D,
 * avec aperçu 3D du brouillon. Rien n'est écrit en base avant « Enregistrer ».
 */
export function SiteEditor({ data, onClose, onSaved, renderPreview }: Props) {
  const [history, setHistory] = useState<History>(() => initHistory(data.sitePlan));
  const [preview, setPreview] = useState<SitePlan | null>(null);
  const [saved, setSaved] = useState<SitePlan>(data.sitePlan);
  const [revision, setRevision] = useState(data.sitePlanRevision);
  const [tool, setTool] = useState<Tool>("select");
  const [propType, setPropType] = useState<PropType>("desk");
  const [selection, setSelection] = useState<Selection>(null);
  const [grid, setGrid] = useState<number | null>(0.1);
  const [view, setView] = useState<View>(() => fitView(data.sitePlan, data.items));
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [confirm, setConfirm] = useState<"close" | "reset" | null>(null);
  const drawing = useRef(false);
  const onDrawing = useCallback((d: boolean) => void (drawing.current = d), []);

  const plan = history.present;
  const shown = preview ?? plan;
  const dirty = plan !== saved;
  const issue = useMemo(() => planIssue(plan), [plan]);

  const commitPlan = useCallback((next: SitePlan, select?: Selection) => {
    setHistory((h) => commit(h, next));
    setPreview(null);
    if (select !== undefined) setSelection(select);
  }, []);
  const patch = useCallback((key: "walls" | "openings" | "rooms" | "props", id: string, value: Record<string, unknown>) => commitPlan(updateElement(plan, key, id, value)), [plan, commitPlan]);

  // Une sélection disparue (annulation, suppression en cascade) est oubliée
  useEffect(() => {
    if (!selection) return;
    const list = { wall: plan.walls, opening: plan.openings, room: plan.rooms, prop: plan.props }[selection.kind] as { id: string }[];
    if (!list.some((x) => x.id === selection.id)) setSelection(null);
  }, [plan, selection]);

  const deleteSelection = useCallback(() => {
    if (selection) commitPlan(removeElements(plan, new Set([selection.id])), null);
  }, [plan, selection, commitPlan]);
  const rotateSelection = useCallback(
    (step = Math.PI / 2) => {
      const p = selection?.kind === "prop" ? plan.props.find((x) => x.id === selection.id) : null;
      if (p) patch("props", p.id, { rotationY: Math.round(((p.rotationY + step) % (Math.PI * 2)) * 10000) / 10000 });
    },
    [plan, selection, patch],
  );
  const duplicateSelection = useCallback(() => {
    if (selection?.kind !== "prop") return;
    const r = duplicateProp(plan, selection.id);
    if (r.id) commitPlan(r.plan, { kind: "prop", id: r.id });
  }, [plan, selection, commitPlan]);
  const splitSelection = useCallback(() => {
    const w = selection?.kind === "wall" ? plan.walls.find((x) => x.id === selection.id) : null;
    if (!w) return;
    const r = splitWallAt(plan, w.id, wallLength(w) / 2);
    if (r.ids) {
      commitPlan(r.plan, { kind: "wall", id: r.ids[1] });
      toast.success("Mur coupé en deux : glissez le point de coupe ou raccordez-y un nouveau mur");
    } else toast.info("Ce mur est trop court pour être coupé");
  }, [plan, selection, commitPlan]);
  const nudge = useCallback(
    (d: Vec2) => {
      if (!selection) return;
      if (selection.kind === "prop") {
        const p = plan.props.find((x) => x.id === selection.id);
        if (p) patch("props", p.id, { position: [Math.round((p.position[0] + d[0]) * 1000) / 1000, Math.round((p.position[1] + d[1]) * 1000) / 1000] });
      } else if (selection.kind === "wall") commitPlan(translateWall(plan, selection.id, d));
    },
    [plan, selection, patch, commitPlan],
  );

  // Raccourcis clavier de l'éditeur
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=alertdialog]")) return;
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && k === "z") setHistory((h) => (e.shiftKey ? redo(h) : undo(h)));
      else if (mod && k === "y") setHistory(redo);
      else if (mod && k === "d") duplicateSelection();
      else if (mod || e.altKey) return;
      else if (e.key === "Delete" || e.key === "Backspace") deleteSelection();
      else if (k === "r") rotateSelection(e.shiftKey ? Math.PI / 12 : Math.PI / 2);
      else if (e.key === "Escape") {
        if (drawing.current) return;
        if (tool !== "select") setTool("select");
        else setSelection(null);
      } else if (e.key.startsWith("Arrow") && selection) {
        const s = grid ?? 0.1;
        nudge(e.key === "ArrowLeft" ? [-s, 0] : e.key === "ArrowRight" ? [s, 0] : e.key === "ArrowUp" ? [0, -s] : [0, s]);
      } else {
        const found = TOOLS.find((x) => x.key.toLowerCase() === k);
        if (!found) return;
        setTool(found.id);
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, selection, grid, deleteSelection, rotateSelection, duplicateSelection, nudge]);

  // Quitter la page avec des modifications non enregistrées : avertissement du navigateur
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    if (issue) return toast.error(issue);
    setSaving(true);
    try {
      const r = await apiFetch<{ revision: number }>("/api/scene/site-plan", { method: "PUT", body: { revision, plan } });
      setRevision(r.revision);
      setSaved(plan);
      toast.success("Plan du site enregistré — une version a été créée");
      await onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.code === "SITE_PLAN_CONFLICT") setConflict(true);
      else toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const reloadFromServer = async () => {
    try {
      const scene = await apiFetch<SceneData>("/api/scene");
      setHistory(initHistory(scene.sitePlan));
      setSaved(scene.sitePlan);
      setRevision(scene.sitePlanRevision);
      setSelection(null);
      setConflict(false);
      toast.info("Plan rechargé : dernière version enregistrée");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const reset = async () => {
    try {
      await apiFetch("/api/scene/site-plan", { method: "DELETE" });
      const def = defaultSitePlan();
      setHistory(initHistory(def));
      setSaved(def);
      setRevision(0);
      setSelection(null);
      toast.success("Plan par défaut rétabli — l'ancien plan reste dans l'historique des versions");
      await onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const hint = TOOLS.find((t) => t.id === tool)!.hint;
  const categories = useMemo(() => {
    const groups = new Map<PropCategory, PropType[]>();
    for (const [type, def] of Object.entries(PROP_CATALOG) as [PropType, (typeof PROP_CATALOG)[PropType]][]) groups.set(def.category, [...(groups.get(def.category) ?? []), type]);
    return [...groups];
  }, []);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background" role="region" aria-label="Éditeur du plan du site">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
        <h2 className="mr-2 text-sm font-semibold">Plan du site</h2>
        <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Outils de dessin">
          {TOOLS.map((t) => {
            const Icon = TOOL_ICONS[t.id];
            return (
              <Button key={t.id} size="sm" variant={tool === t.id ? "default" : "ghost"} onClick={() => setTool(t.id)} aria-pressed={tool === t.id} title={`${t.label} (${t.key}) — ${t.hint}`} disabled={mode === "3d"}>
                <Icon /> {t.label}
              </Button>
            );
          })}
        </div>
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <Button size="icon-sm" variant="ghost" onClick={() => setHistory(undo)} disabled={!history.past.length} aria-label="Annuler (Ctrl+Z)" title="Annuler (Ctrl+Z)">
          <Undo2 />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={() => setHistory(redo)} disabled={!history.future.length} aria-label="Rétablir (Ctrl+Y)" title="Rétablir (Ctrl+Y)">
          <Redo2 />
        </Button>
        <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          Grille
          <select value={grid ?? "free"} onChange={(e) => setGrid(e.target.value === "free" ? null : Number(e.target.value))} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground" title="Magnétisme de la grille">
            {GRIDS.map((g) => (
              <option key={g.label} value={g.value ?? "free"}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" variant="ghost" onClick={() => setView(fitView(plan, data.items))} title="Recentrer la vue sur tout le plan">
          <Maximize /> Recentrer
        </Button>
        <div className="flex gap-1" role="group" aria-label="Affichage">
          <Button size="sm" variant={mode === "2d" ? "secondary" : "ghost"} onClick={() => setMode("2d")} aria-pressed={mode === "2d"}>
            <MapIcon /> Plan 2D
          </Button>
          <Button size="sm" variant={mode === "3d" ? "secondary" : "ghost"} onClick={() => setMode("3d")} aria-pressed={mode === "3d"} title="Aperçu 3D du brouillon (non enregistré)">
            <Box /> Aperçu 3D
          </Button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {issue ? (
            <span className="flex max-w-xs items-center gap-1 truncate text-xs text-warning" title={issue} role="status">
              <TriangleAlert className="size-4 shrink-0" aria-hidden /> {issue}
            </span>
          ) : dirty ? (
            <span className="text-xs text-muted-foreground" role="status">
              Modifications non enregistrées
            </span>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setConfirm("reset")} title="Revenir au plan d'origine (le plan actuel reste dans l'historique)">
            <RotateCcw /> Plan par défaut
          </Button>
          <Button size="sm" onClick={() => void save()} loading={saving} disabled={!dirty || Boolean(issue)}>
            <Save /> Enregistrer
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => (dirty ? setConfirm("close") : onClose())} aria-label="Fermer l'éditeur" title="Fermer l'éditeur">
            <X />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Catalogue d'accessoires */}
        <aside className="hidden w-52 shrink-0 overflow-y-auto border-r border-border p-2 md:block" aria-label="Catalogue d'accessoires">
          {categories.map(([cat, types]) => (
            <div key={cat} className="mb-3">
              <h3 className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{PROP_CATEGORIES[cat]}</h3>
              <ul className="flex flex-col">
                {types.map((type) => {
                  const def = PROP_CATALOG[type];
                  const active = tool === "prop" && propType === type;
                  return (
                    <li key={type}>
                      <button
                        type="button"
                        disabled={mode === "3d"}
                        onClick={() => {
                          setPropType(type);
                          setTool("prop");
                        }}
                        aria-pressed={active}
                        className={cn("flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted disabled:opacity-50", active && "bg-primary/15 text-primary")}
                        title={`${def.label} — ${def.size.map((s) => s.toLocaleString("fr-FR")).join(" × ")} m`}
                      >
                        <span className="size-3 shrink-0 rounded-sm border border-border" style={{ background: def.color }} aria-hidden />
                        {def.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        <div className="relative min-w-0 flex-1">
          {mode === "2d" ? (
            <PlanCanvas
              plan={shown}
              items={data.items}
              tool={tool}
              propType={propType}
              selection={selection}
              grid={grid}
              view={view}
              onView={setView}
              onSelect={setSelection}
              onPreview={setPreview}
              onCommit={commitPlan}
              onCursor={setCursor}
              onDrawing={onDrawing}
            />
          ) : (
            renderPreview(plan)
          )}
          {mode === "2d" ? (
            <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap items-center gap-3 rounded-md border border-border bg-background/85 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
              <span>{hint}</span>
              <span className="tabular-nums">{cursor ? `x ${cursor[0].toLocaleString("fr-FR", { minimumFractionDigits: 2 })} · z ${cursor[1].toLocaleString("fr-FR", { minimumFractionDigits: 2 })} m` : ""}</span>
              <span>Molette : zoom · clic droit / Espace + glisser : déplacer la vue</span>
            </div>
          ) : null}
        </div>

        {/* Propriétés */}
        <aside className="w-64 shrink-0 overflow-y-auto border-l border-border p-3" aria-label="Propriétés">
          <PropertiesPanel plan={plan} selection={selection} onPatch={patch} onDelete={deleteSelection} onDuplicate={duplicateSelection} onRotate={() => rotateSelection()} onSplit={splitSelection} />
          <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
            Raccourcis : V M P D F A outils · Suppr supprimer · R tourner (Maj : 15°) · Ctrl+D dupliquer · flèches : décaler · Ctrl+Z / Ctrl+Y · Échap
          </p>
        </aside>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "reset" ? "Revenir au plan par défaut ?" : "Quitter sans enregistrer ?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "reset"
                ? "Les murs, pièces et accessoires actuels seront remplacés par le plan d'origine. Le plan actuel reste récupérable dans l'historique des versions (bouton « Agencer » → Historique)."
                : "Les modifications du plan du site faites depuis le dernier enregistrement seront perdues."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              destructive
              onClick={() => {
                if (confirm === "reset") void reset();
                else onClose();
              }}
            >
              {confirm === "reset" ? "Revenir au plan par défaut" : "Quitter sans enregistrer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={conflict} onOpenChange={setConflict}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Plan modifié entre-temps</AlertDialogTitle>
            <AlertDialogDescription>Un autre utilisateur a enregistré le plan du site pendant que vous le modifiiez. Rechargez sa version (vos modifications seront perdues) ou fermez ce message pour les conserver à l&apos;écran.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder mes modifications</AlertDialogCancel>
            <AlertDialogAction destructive onClick={() => void reloadFromServer()}>
              Recharger le plan enregistré
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
