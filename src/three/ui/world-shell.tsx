"use client";
import { Box, CalendarRange, Presentation, ChevronLeft, ChevronRight, Pause, Play, Truck, CheckCircle2, ClipboardCheck, Copy, Flame, Grid3x3, Layers, Loader2, Map as MapIcon, Move3d, PencilRuler, PersonStanding, RefreshCw, RotateCw, Save, Search, Tv, Undo2, X } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/feedback/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OFFICE_FURNITURE, TIMELINE, ZONES } from "@/features/scene/layout";
import type { LoadingSimulation, SceneData, SceneItem } from "@/features/scene/types";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { detectWebGL } from "../loaders/webgl";
import { STATUS_COLORS, STATUS_LABELS } from "../materials/palette";
import { heatColor } from "../objects/overlays";
import type { CameraReader, FocusTarget } from "../scenes/world-scene";
import type { MeetingData } from "../objects/office-furniture";
import type { PresenceUser } from "../objects/presence";
import { LayoutHistory } from "./layout-history";
import { decodeView, ViewBookmarks } from "./view-bookmarks";
import { AnimationsMenu } from "./animations-menu";
import { useAssistant } from "@/assistant/use-assistant";
import { AssistantPanel } from "./assistant-panel";
import { createWorldBridge, ERIC_HOME, type EricSpot, type WorldBridgeDeps } from "./world-bridge";
import { Plan2D } from "./plan-2d";
import { LIGHTING_LABELS, QUALITY_LABELS, useLighting, useQuality, type Lighting, type Quality } from "./quality";
import { ScenePanel } from "./scene-panel";
import { SiteEditor } from "./site-editor/site-editor";

// Three.js n'est chargé que sur cette page, côté client, et seulement si WebGL est disponible
const WorldScene = dynamic(() => import("../scenes/world-scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Chargement du moteur 3D…
    </div>
  ),
});

class SceneErrorBoundary extends Component<{ onError: (message: string) => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    this.props.onError(error.message);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

type Placement = { position: [number, number, number]; rotationY: number };
const NOT_PLACEABLE = new Set<SceneItem["kind"]>(["EVENT", "STAFF_DESK", "MISSION_MAP"]);

/** Code suivant libre : « B-04 » → « B-05 » (même nombre de chiffres), sinon suffixe « -2 », « -3 »… */
function nextCode(code: string, used: Set<string>) {
  const m = /^(.*?)(\d+)$/.exec(code);
  for (let n = 1; n < 500; n++) {
    const candidate = m ? `${m[1]}${String(Number(m[2]) + n).padStart(m[2]!.length, "0")}` : `${code}-${n + 1}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${code}-${Date.now() % 10000}`;
}

export function WorldShell({ canEditLayout, canCount, canDuplicate, assistant = false, locations }: { canEditLayout: boolean; canCount: boolean; canDuplicate: boolean; assistant?: boolean; locations: { value: string; label: string }[] }) {
  const params = useSearchParams();
  const [data, setData] = useState<SceneData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"3d" | "plan">(params.get("mode") === "plan" ? "plan" : "3d");
  const [webgl, setWebgl] = useState<{ supported: boolean; reason?: string } | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(params.get("focus"));
  const [focus, setFocus] = useState<FocusTarget>(() => {
    const f = params.get("focus");
    const z = params.get("zone");
    const v = decodeView(params.get("view"));
    if (v) return { kind: "view", ...v };
    if (f) return { kind: "item", key: f };
    if (z) return { kind: "zone", zone: z };
    return { kind: "overview" };
  });
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const cameraProbe = useRef<CameraReader | null>(null);
  const [quality, setQuality] = useQuality();
  const [lighting, setLighting] = useLighting();
  const [degradedTo, setDegradedTo] = useState<Quality | null>(null);
  useEffect(() => setDegradedTo(null), [quality]);
  const [routeKey, setRouteKey] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<"heat" | "count" | null>(params.get("overlay") === "count" ? "count" : params.get("overlay") === "heat" ? "heat" : null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [pending, setPending] = useState<Map<string, Placement>>(new Map());
  const [undoStack, setUndoStack] = useState<Map<string, Placement>[]>([]);
  const [snap, setSnap] = useState(true);
  const [saving, setSaving] = useState(false);
  const [walk, setWalk] = useState(false);
  const [siteEditor, setSiteEditor] = useState(false);
  const [timelineDay, setTimelineDay] = useState(0);
  const [others, setOthers] = useState<PresenceUser[]>([]);
  const presence = useMemo(() => ({ page: "world", others, onOthers: setOthers }), [others]);
  const [loadingSim, setLoadingSim] = useState<LoadingSimulation | null>(null);
  // Réunion : dossier de l'événement sur l'écran de la salle, caméra assise à la table
  const [meeting, setMeeting] = useState<(MeetingData & { eventId: string }) | null>(null);
  const startMeeting = useCallback(async (eventId: string) => {
    try {
      const d = await apiFetch<MeetingData>(`/api/scene/objects/EVENT/${eventId}`);
      setMeeting({ ...d, eventId });
      setWalk(false);
      setEditMode(false);
      setSelectedKey(null);
      const [x, , z] = OFFICE_FURNITURE.meetingTable;
      setFocus({ kind: "view", position: [x, 1.6, z + 1.2], target: [x, 1.95, z - 2.9] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }, []);
  const [simPlaying, setSimPlaying] = useState(false);
  // Lecture automatique de la simulation : une étape toutes les 1,6 s
  useEffect(() => {
    if (!simPlaying || !loadingSim) return;
    if (loadingSim.step >= loadingSim.steps.length) {
      setSimPlaying(false);
      return;
    }
    const t = setTimeout(() => setLoadingSim((s) => (s ? { ...s, step: s.step + 1 } : s)), 1600);
    return () => clearTimeout(t);
  }, [simPlaying, loadingSim]);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<SceneData>("/api/scene"));
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    setWebgl(detectWebGL());
    void load();
  }, [load]);

  // Données en direct : rechargement toutes les 30 s (onglet visible, sans modification d'agencement en cours)
  const idleForRefresh = !editMode && !siteEditor && pending.size === 0;
  useEffect(() => {
    if (!idleForRefresh) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => clearInterval(t);
  }, [idleForRefresh, load]);

  // Les déplacements non enregistrés sont prévisualisés dans le plan 2D comme dans la 3D
  const planView = useMemo<SceneData | null>(() => {
    if (!data || pending.size === 0) return data;
    return { ...data, items: data.items.map((i): SceneItem => (pending.has(i.key) ? { ...i, ...pending.get(i.key)! } : i)) };
  }, [data, pending]);
  const selected = useMemo(() => data?.items.find((i) => i.key === selectedKey) ?? null, [data, selectedKey]);
  const use3d = mode === "3d" && webgl?.supported && !sceneError;
  const countList = useMemo(() => (data?.items ?? []).filter((i) => i.count?.today).sort((a, b) => Number(a.count!.done) - Number(b.count!.done) || a.label.localeCompare(b.label)), [data]);
  const hasStock = Boolean(data?.items.some((i) => i.kind === "STOCK_LOCATION"));

  const select = (key: string | null) => {
    setSelectedKey(key);
    if (key) setFocus({ kind: "item", key });
  };

  const highlightStatus = (status: SceneItem["status"]) => {
    if (!data) return;
    const keys = new Set(data.items.filter((i) => i.status === status).map((i) => i.key));
    setHighlighted(keys);
    if (keys.size === 0) toast.info(`Aucun objet à l'état « ${STATUS_LABELS[status]} »`);
    else toast.success(`${keys.size} objet(s) à l'état « ${STATUS_LABELS[status]} » mis en évidence`);
  };

  // Raccourcis clavier : 0 vue d'ensemble, 1-5 zones, Échap désélection (R et Ctrl+Z : voir mode agencement)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || walk || t?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      if (e.key === "Escape") {
        setSelectedKey(null);
        setHighlighted(new Set());
      } else if (e.key === "0") setFocus({ kind: "overview" });
      else if (/^[1-9]$/.test(e.key) && ZONES[Number(e.key) - 1]) setFocus({ kind: "zone", zone: ZONES[Number(e.key) - 1]!.id });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [walk]);

  /** Localise un matériel : emplacements mis en évidence, chemin depuis l'entrée, vue de l'entrepôt. */
  const locate = useCallback(
    async (q: string) => {
      const results = await apiFetch<{ id: string; name: string; sku: string; locations: { id: string; code: string; kind: string; quantity: number }[] }[]>(`/api/inventory/search?q=${encodeURIComponent(q)}`);
      const keys = new Set(results.flatMap((r) => r.locations.map((l) => `STOCK_LOCATION:${l.id}`)).filter((k) => data?.items.some((i) => i.key === k)));
      setHighlighted(keys);
      setRouteKey(keys.size ? [...keys][0]! : null);
      // Vue de l'entrepôt pour voir tout le chemin depuis l'entrée jusqu'au premier emplacement
      if (keys.size) setFocus({ kind: "zone", zone: "WAREHOUSE" });
      return { product: results[0]?.name ?? null, locations: keys.size };
    },
    [data],
  );

  const search = async () => {
    const q = query.trim();
    if (!q) {
      setRouteKey(null);
      return setHighlighted(new Set());
    }
    setSearching(true);
    try {
      const r = await locate(q);
      if (r.locations === 0) toast.info(r.product ? "Matériel trouvé mais hors des emplacements représentés (sorti ou en zone système)" : "Aucune référence trouvée");
      else toast.success(`${r.product} : ${r.locations} emplacement(s) mis en évidence — suivez le chemin depuis l'entrée`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSearching(false);
    }
  };

  // ── Assistant Eric : pont vers la scène (état lu au moment de chaque commande) ──
  const [ericSpot, setEricSpot] = useState<EricSpot>(ERIC_HOME);
  const [ericOpen, setEricOpen] = useState(false);
  const simulateLoading = useCallback(async (item: SceneItem) => {
    const d = await apiFetch<{ loadingPlan?: { event: string; steps: { step: number; name: string; quantity: number; volume: number | null; color?: string | null; zone: string }[] } | null }>(`/api/scene/objects/VEHICLE/${item.businessId}`);
    const plan = d.loadingPlan;
    if (!plan?.steps.length) return null;
    setSelectedKey(item.key);
    setFocus({ kind: "item", key: item.key });
    setLoadingSim({ vehicleKey: item.key, event: plan.event, step: 0, steps: plan.steps.map((s) => ({ step: s.step, name: s.name, quantity: s.quantity, volume: s.volume, color: s.color ?? null, zone: s.zone })) });
    setSimPlaying(true);
    return plan.event;
  }, []);
  const bridgeDeps = useRef<WorldBridgeDeps | null>(null);
  bridgeDeps.current = {
    getState: () => ({ data, mode, overlay, selectedKey, webgl: Boolean(webgl?.supported) && !sceneError, walk, editMode, siteEditor }),
    select: (key) => select(key),
    setFocus,
    setHighlighted,
    setMode,
    setOverlay,
    locate,
    startMeeting,
    simulateLoading,
    moveEric: setEricSpot,
  };
  const worldBridge = useMemo(() => createWorldBridge({
    getState: () => bridgeDeps.current!.getState(),
    select: (key) => bridgeDeps.current!.select(key),
    setFocus: (f) => bridgeDeps.current!.setFocus(f),
    setHighlighted: (k) => bridgeDeps.current!.setHighlighted(k),
    setMode: (m) => bridgeDeps.current!.setMode(m),
    setOverlay: (o) => bridgeDeps.current!.setOverlay(o),
    locate: (q) => bridgeDeps.current!.locate(q),
    startMeeting: (id) => bridgeDeps.current!.startMeeting(id),
    simulateLoading: (item) => bridgeDeps.current!.simulateLoading(item),
    moveEric: (spot) => bridgeDeps.current!.moveEric(spot),
  }), []);
  const eric = useAssistant(assistant ? worldBridge : undefined, () => void load());
  // Une action proposée par Eric doit être visible pour être confirmée : le panneau s'ouvre
  const pendingConfirmations = eric.confirmations.filter((c) => !c.outcome).length;
  useEffect(() => {
    if (pendingConfirmations) setEricOpen(true);
  }, [pendingConfirmations]);
  const ericInScene = useMemo(
    () => (assistant ? { spot: ericSpot, status: eric.status, thinking: eric.activity !== null, level: eric.voiceLevel, onClick: () => setEricOpen((o) => !o) } : null),
    [assistant, ericSpot, eric.status, eric.activity, eric.voiceLevel],
  );

  // ── Agencement : modifications en attente, annulation, rotation, duplication ──
  const placementOf = useCallback((item: SceneItem): Placement => pending.get(item.key) ?? { position: item.position, rotationY: item.rotationY }, [pending]);
  const change = useCallback(
    (key: string, next: Placement) => {
      setUndoStack((s) => [...s.slice(-49), pending]);
      setPending(new Map(pending).set(key, next));
    },
    [pending],
  );
  const undo = useCallback(() => {
    if (!undoStack.length) return;
    setPending(undoStack[undoStack.length - 1]!);
    setUndoStack(undoStack.slice(0, -1));
  }, [undoStack]);
  const rotateSelected = useCallback(() => {
    if (!selected || NOT_PLACEABLE.has(selected.kind)) return;
    const p = placementOf(selected);
    change(selected.key, { position: p.position, rotationY: Math.round(((p.rotationY + Math.PI / 2) % (Math.PI * 2)) * 1000) / 1000 });
  }, [selected, placementOf, change]);

  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        rotateSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode, undo, rotateSelected]);

  const savePlacements = async () => {
    if (!data || !pending.size) return;
    setSaving(true);
    try {
      const changes = [...pending].flatMap(([key, p]) => {
        const item = data.items.find((i) => i.key === key);
        return item ? [{ kind: item.kind, businessId: item.businessId, label: item.label, position: p.position, rotationY: p.rotationY, scale: item.scale }] : [];
      });
      const names = changes.slice(0, 3).map((c) => c.label).join(", ");
      await apiFetch("/api/scene/layout", { method: "POST", body: { label: `${changes.length} modification(s) : ${names}${changes.length > 3 ? "…" : ""}`, changes } });
      toast.success(`${changes.length} modification(s) enregistrée(s) — version créée`);
      setPending(new Map());
      setUndoStack([]);
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const duplicateSelected = async () => {
    if (!data || !selected || selected.kind !== "STOCK_LOCATION" || selected.variant !== "rack") return;
    const used = new Set(data.items.map((i) => i.label));
    const code = nextCode(selected.label, used);
    const name = selected.sublabel?.includes(selected.label) ? selected.sublabel.replace(selected.label, code) : `${selected.sublabel ?? selected.label} (copie)`;
    const p = placementOf(selected);
    try {
      const created = await apiFetch<{ id: string }>("/api/inventory/locations", { method: "POST", body: { code, name, kind: "RACK", isActive: true } });
      const position: [number, number, number] = [Math.round((p.position[0] + 6.5) * 10) / 10, 0, p.position[2]];
      await apiFetch("/api/scene/layout", { method: "POST", body: { label: `Duplication de ${selected.label} → ${code}`, changes: [{ kind: "STOCK_LOCATION", businessId: created.id, label: code, position, rotationY: p.rotationY, scale: selected.scale }] } });
      toast.success(`Rayonnage ${code} créé à côté de ${selected.label} (vide) — déplacez-le si besoin`);
      await load();
      setSelectedKey(`STOCK_LOCATION:${created.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="relative -m-4 flex h-[calc(100dvh-4rem)] flex-col sm:-m-6">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background/90 px-3 py-2 backdrop-blur">
        <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Zones">
          <Button size="sm" variant={focus.kind === "overview" ? "secondary" : "ghost"} onClick={() => setFocus({ kind: "overview" })}>
            <Layers /> Vue d&apos;ensemble
          </Button>
          {ZONES.map((z) => (
            <Button key={z.id} size="sm" variant={focus.kind === "zone" && focus.zone === z.id ? "secondary" : "ghost"} onClick={() => setFocus({ kind: "zone", zone: z.id })}>
              <span className="size-2 rounded-full" style={{ background: z.color }} aria-hidden />
              {z.label}
            </Button>
          ))}
        </div>
        <form
          className="ml-auto flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Localiser une référence…" className="h-8 w-56 pl-8" aria-label="Localiser une référence dans l'entrepôt" />
          </div>
          <Button type="submit" size="sm" variant="outline" loading={searching}>
            Localiser
          </Button>
          {highlighted.size ? (
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Effacer la mise en évidence" onClick={() => {
                setHighlighted(new Set());
                setRouteKey(null);
              }}>
              <X />
            </Button>
          ) : null}
        </form>
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant={mode === "3d" ? "secondary" : "ghost"} onClick={() => setMode("3d")} disabled={webgl !== null && !webgl.supported} aria-pressed={mode === "3d"}>
            <Box /> 3D
          </Button>
          <Button size="sm" variant={mode === "plan" ? "secondary" : "ghost"} onClick={() => setMode("plan")} aria-pressed={mode === "plan"}>
            <MapIcon /> Plan
          </Button>
          {use3d ? (
            <Button
              size="sm"
              variant={walk ? "default" : "ghost"}
              onClick={() => {
                setWalk(!walk);
                setEditMode(false);
              }}
              aria-pressed={walk}
              title="Visite à pied, à hauteur d'homme"
            >
              <PersonStanding /> Visite
            </Button>
          ) : null}
          {canEditLayout && use3d && !walk ? (
            <Button size="sm" variant={editMode ? "default" : "ghost"} onClick={() => setEditMode(!editMode)} aria-pressed={editMode}>
              <Move3d /> Agencer
            </Button>
          ) : null}
          {canEditLayout && !walk && data ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSiteEditor(true);
                setEditMode(false);
                setSelectedKey(null);
                setMeeting(null);
              }}
              title="Dessiner les locaux : murs, portes, fenêtres, pièces et accessoires"
            >
              <PencilRuler /> Plan du site
            </Button>
          ) : null}
          {editMode ? (
            <>
              <Button size="sm" variant={snap ? "secondary" : "ghost"} onClick={() => setSnap(!snap)} aria-pressed={snap} title="Aimanter les déplacements à une grille de 1 m">
                <Grid3x3 /> Grille
              </Button>
              <Button size="sm" variant="ghost" onClick={rotateSelected} disabled={!selected || NOT_PLACEABLE.has(selected.kind)} title="Tourner l'objet sélectionné de 90° (touche R)">
                <RotateCw /> Tourner
              </Button>
              {canDuplicate ? (
                <Button size="sm" variant="ghost" onClick={() => void duplicateSelected()} disabled={!selected || selected.variant !== "rack"} title="Créer un nouveau rayonnage à côté de celui sélectionné">
                  <Copy /> Dupliquer
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={undo} disabled={!undoStack.length} title="Annuler la dernière modification (Ctrl+Z)">
                <Undo2 /> Annuler
              </Button>
              <LayoutHistory
                onRestored={() => {
                  setPending(new Map());
                  setUndoStack([]);
                  void load();
                }}
              />
            </>
          ) : null}
          {pending.size ? (
            <Button size="sm" onClick={savePlacements} loading={saving}>
              <Save /> Enregistrer ({pending.size})
            </Button>
          ) : null}
          <Button size="icon-sm" variant="ghost" onClick={() => void load()} aria-label="Recharger les données">
            <RefreshCw />
          </Button>
          {hasStock ? (
            <>
              <Button size="sm" variant={overlay === "heat" ? "secondary" : "ghost"} onClick={() => setOverlay(overlay === "heat" ? null : "heat")} aria-pressed={overlay === "heat"} title="Sorties de stock par emplacement sur 90 jours">
                <Flame /> Chaleur
              </Button>
              <Button size="sm" variant={overlay === "count" ? "secondary" : "ghost"} onClick={() => setOverlay(overlay === "count" ? null : "count")} aria-pressed={overlay === "count"} title="Inventaire tournant du jour">
                <ClipboardCheck /> Comptage
              </Button>
            </>
          ) : null}
          {use3d ? (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Qualité
              <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground" title="Ombres, résolution et effets de la scène 3D (mémorisé dans ce navigateur)">
                {(Object.keys(QUALITY_LABELS) as Quality[]).map((q) => (
                  <option key={q} value={q}>
                    {QUALITY_LABELS[q]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {use3d ? (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Éclairage
              <select value={lighting} onChange={(e) => setLighting(e.target.value as Lighting)} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground" title="Lumière du jour selon l'heure réelle du site, ou jour / nuit forcés">
                {(Object.keys(LIGHTING_LABELS) as Lighting[]).map((l) => (
                  <option key={l} value={l}>
                    {LIGHTING_LABELS[l]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {use3d ? <AnimationsMenu quality={quality} /> : null}
          {use3d ? (
            <ViewBookmarks
              read={() => cameraProbe.current?.() ?? null}
              onGo={(v) => {
                setWalk(false);
                setFocus({ kind: "view", position: v.position, target: v.target });
              }}
            />
          ) : null}
          <Button asChild size="sm" variant="ghost">
            <Link href="/wall" title="Affichage TV : rotation automatique entre les zones">
              <Tv /> Mur d&apos;écrans
            </Link>
          </Button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {loadError ? (
            <div className="p-6">
              <Alert tone="danger" title="Impossible de charger la scène">
                {loadError}
              </Alert>
            </div>
          ) : !data || !webgl ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Chargement des données réelles…
            </div>
          ) : use3d ? (
            <SceneErrorBoundary onError={(m) => setSceneError(m)}>
              <WorldScene
                data={data}
                selectedKey={selectedKey}
                highlighted={highlighted}
                focus={focus}
                editMode={editMode}
                onSelect={(k) => (editMode && k === null ? undefined : select(k))}
                onMove={(key, position) => {
                  const item = data.items.find((i) => i.key === key);
                  if (item) change(key, { position, rotationY: placementOf(item).rotationY });
                }}
                onContextLost={() => setSceneError("Le contexte WebGL a été perdu")}
                onZoneClick={(zone) => setFocus({ kind: "zone", zone })}
                routeTo={routeKey}
                overlay={overlay}
                quality={quality}
                lighting={lighting}
                onQualityDegraded={setDegradedTo}
                walk={walk}
                onExitWalk={() => setWalk(false)}
                overrides={pending}
                snap={snap ? 1 : null}
                loadingSim={loadingSim}
                meeting={meeting}
                presence={presence}
                cameraProbe={cameraProbe}
                eric={ericInScene}
              />
            </SceneErrorBoundary>
          ) : (
            <div className="flex h-full flex-col">
              {mode === "3d" ? (
                <Alert tone="warning" className="m-3" title="Mode de secours 2D">
                  {sceneError ? `Le rendu 3D a rencontré une erreur (${sceneError}).` : webgl.reason} Toutes les fonctionnalités restent disponibles via le plan ci-dessous et les pages classiques.
                </Alert>
              ) : null}
              <div className="min-h-0 flex-1 p-3">
                <Plan2D data={planView ?? data} selectedKey={selectedKey} highlighted={highlighted} onSelect={(k) => select(k)} />
              </div>
            </div>
          )}

          {overlay === "count" && data ? (
            <div className="absolute top-3 left-3 z-10 w-72 rounded-xl border border-border bg-background/90 p-3 text-sm shadow-lg backdrop-blur">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Inventaire du jour</h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {countList.filter((i) => i.count!.done).length} / {countList.length}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={countList.filter((i) => i.count!.done).length} aria-valuemin={0} aria-valuemax={countList.length} aria-label="Avancement de l'inventaire du jour">
                <div className="h-full rounded-full bg-success" style={{ width: `${countList.length ? (countList.filter((i) => i.count!.done).length / countList.length) * 100 : 0}%` }} />
              </div>
              {countList.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">Tous les emplacements ont été comptés il y a moins de 30 jours.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-1">
                  {countList.map((i) => (
                    <li key={i.key} className="flex items-center gap-2">
                      {i.count!.done ? <CheckCircle2 className="size-4 text-success" aria-label="Compté" /> : <span className="size-4 rounded-full border-2 border-warning" aria-label="À compter" />}
                      <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => select(i.key)}>
                        {i.label} <span className="text-xs text-muted-foreground">{i.count!.lastAt ? `· ${new Date(i.count!.lastAt).toLocaleDateString("fr-FR")}` : "· jamais compté"}</span>
                      </button>
                      {canCount && !i.count!.done ? (
                        <Link href={`/inventory/count?locationId=${i.businessId}`} className="text-xs font-medium text-primary hover:underline">
                          Compter
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">Chaque emplacement est recompté au moins tous les 30 jours, 5 par jour.</p>
            </div>
          ) : null}

          {walk ? (
            <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-background/90 py-1.5 pr-1.5 pl-4 text-xs shadow-lg backdrop-blur" role="status">
              <PersonStanding className="size-4 text-primary" aria-hidden />
              <span>
                <kbd>Z Q S D</kbd> / flèches : marcher · <kbd>Maj</kbd> : courir · glisser : regarder · <kbd>Échap</kbd> : quitter
              </span>
              <Button size="sm" variant="secondary" onClick={() => setWalk(false)}>
                Quitter
              </Button>
            </div>
          ) : null}

          {use3d && !walk && ((focus.kind === "zone" && focus.zone === "EVENTS") || focus.kind === "timeline") ? (
            <div className="absolute bottom-3 left-1/2 z-10 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-border bg-background/90 p-3 text-sm shadow-lg backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="timeline-day" className="flex items-center gap-2 font-medium">
                  <CalendarRange className="size-4 text-primary" aria-hidden /> Voyager dans le temps
                </label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "long" }).format(new Date(Date.now() + timelineDay * 86_400_000))} ·{" "}
                  {timelineDay === 0 ? "aujourd'hui" : timelineDay > 0 ? `J+${timelineDay}` : `J${timelineDay}`}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="timeline-day"
                  type="range"
                  min={-TIMELINE.pastDays}
                  max={TIMELINE.futureDays}
                  step={1}
                  value={timelineDay}
                  onChange={(e) => {
                    const day = Number(e.target.value);
                    setTimelineDay(day);
                    setFocus({ kind: "timeline", day });
                  }}
                  className="flex-1 accent-primary"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTimelineDay(0);
                    setFocus({ kind: "timeline", day: 0 });
                  }}
                >
                  Aujourd&apos;hui
                </Button>
              </div>
            </div>
          ) : null}

          {loadingSim ? (
            <div className="absolute top-3 left-1/2 z-10 w-[min(520px,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-border bg-background/90 p-3 text-sm shadow-lg backdrop-blur" role="region" aria-label="Simulation de chargement">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-medium">
                  <Truck className="size-4 text-primary" aria-hidden /> Chargement · {loadingSim.event}
                </p>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Étape {loadingSim.step} / {loadingSim.steps.length}
                </span>
              </div>
              <p className="mt-1 min-h-5 truncate text-xs" aria-live="polite">
                {loadingSim.step === 0
                  ? "Caisse vide — lancez la simulation"
                  : (() => {
                      const s = loadingSim.steps[loadingSim.step - 1]!;
                      return `${s.step}. ${s.name} × ${s.quantity} — ${s.zone}`;
                    })()}
              </p>
              <div className="mt-2 flex items-center gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Étape précédente" disabled={loadingSim.step === 0} onClick={() => setLoadingSim({ ...loadingSim, step: loadingSim.step - 1 })}>
                  <ChevronLeft />
                </Button>
                <Button
                  size="icon-sm"
                  variant="secondary"
                  aria-label={simPlaying ? "Pause" : "Lecture"}
                  onClick={() => {
                    if (!simPlaying && loadingSim.step >= loadingSim.steps.length) setLoadingSim({ ...loadingSim, step: 0 });
                    setSimPlaying(!simPlaying);
                  }}
                >
                  {simPlaying ? <Pause /> : <Play />}
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Étape suivante" disabled={loadingSim.step >= loadingSim.steps.length} onClick={() => setLoadingSim({ ...loadingSim, step: loadingSim.step + 1 })}>
                  <ChevronRight />
                </Button>
                <div className="mx-2 h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(loadingSim.step / Math.max(1, loadingSim.steps.length)) * 100}%` }} />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setLoadingSim(null);
                    setSimPlaying(false);
                  }}
                >
                  Fermer
                </Button>
              </div>
            </div>
          ) : null}

          {use3d && others.length ? (
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full border border-border bg-background/90 py-1 pr-1 pl-3 text-xs shadow-lg backdrop-blur" role="group" aria-label="Collègues connectés">
              <span className="text-muted-foreground">En ligne</span>
              {others.map((o) => (
                <button
                  key={o.userId}
                  type="button"
                  title={`${o.name} — rejoindre son point de vue${o.selectedKey ? ` (${data?.items.find((i) => i.key === o.selectedKey)?.label ?? "objet sélectionné"})` : ""}`}
                  aria-label={`Rejoindre le point de vue de ${o.name}`}
                  onClick={() => {
                    setWalk(false);
                    setFocus({ kind: "view", position: o.camera.position, target: o.camera.target });
                  }}
                  className="flex size-7 items-center justify-center rounded-full text-[11px] font-bold text-slate-950 ring-2 ring-background transition-transform hover:scale-110"
                  style={{ background: o.color }}
                >
                  {o.name
                    .split(/\s+/)
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </button>
              ))}
            </div>
          ) : null}

          {meeting ? (
            <div className="absolute top-3 left-1/2 z-10 flex w-[min(640px,calc(100%-2rem))] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-border bg-background/90 p-2.5 text-sm shadow-lg backdrop-blur" role="region" aria-label="Réunion en cours">
              <Presentation className="size-4 text-primary" aria-hidden />
              <span className="font-medium">Réunion</span>
              <select
                value={meeting.eventId}
                onChange={(e) => void startMeeting(e.target.value)}
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                aria-label="Événement de la réunion"
              >
                {(data?.items.find((i) => i.kind === "MEETING_TABLE")?.meeting?.events ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.reference} · {e.name}
                  </option>
                ))}
              </select>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/events/${meeting.eventId}`}>Dossier complet</Link>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setMeeting(null);
                  setFocus({ kind: "zone", zone: "OFFICE" });
                }}
              >
                Quitter
              </Button>
            </div>
          ) : null}

          {/* Légende */}
          {data ? (
            <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-xs flex-col gap-1 rounded-lg border border-border bg-background/85 p-2.5 text-[11px] backdrop-blur">
              {(Object.keys(STATUS_COLORS) as (keyof typeof STATUS_COLORS)[]).map((s) => {
                const count = data.items.filter((i) => i.status === s).length;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => highlightStatus(s)}
                    className="pointer-events-auto -mx-1 flex items-center gap-1.5 rounded px-1 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    title={`Mettre en évidence les objets « ${STATUS_LABELS[s]} »`}
                  >
                    <span className="size-2 rounded-full" style={{ background: STATUS_COLORS[s] }} aria-hidden /> {STATUS_LABELS[s]}
                    <span className="ml-auto pl-3 text-muted-foreground tabular-nums">{count}</span>
                  </button>
                );
              })}
              <span className="mt-1 text-muted-foreground">
                {data.counts.locations} emplacements · {data.counts.vehicles} véhicules · {data.counts.events} événements
              </span>
              {overlay === "heat" ? (
                <span className="mt-1 flex flex-col gap-1">
                  <span className="text-muted-foreground">Sorties sur 90 jours (préparations, expéditions, transferts)</span>
                  <span className="h-2 w-full rounded-full" style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(heatColor).join(", ")})` }} aria-hidden />
                  <span className="flex justify-between text-muted-foreground">
                    <span>Peu</span>
                    <span>Beaucoup</span>
                  </span>
                </span>
              ) : null}
              <span className="text-muted-foreground">Clavier : 0 vue d&apos;ensemble · 1–5 zones · Échap désélectionner</span>
              {use3d ? <span className="text-muted-foreground">Clic : sélectionner · glisser : tourner · molette : zoom · clic droit : déplacer</span> : null}
              {degradedTo ? <span className="text-warning">Qualité réduite automatiquement à « {QUALITY_LABELS[degradedTo]} » pour garder une navigation fluide</span> : null}
              {editMode ? <span className="text-warning">Mode agencement : sélectionnez un objet puis faites-le glisser · R : tourner · Ctrl+Z : annuler</span> : null}
            </div>
          ) : null}

          {/* Assistant vocal Eric (masqué pendant l'édition du plan du site) */}
          {assistant && !siteEditor ? <AssistantPanel assistant={eric} open={ericOpen} onOpenChange={setEricOpen} /> : null}
        </div>

        {selected ? (
          <div className={cn("absolute inset-x-0 bottom-0 z-10 h-[55%] md:static md:h-auto md:w-[380px] md:shrink-0")}>
            <ScenePanel
              item={selected}
              locations={locations}
              onClose={() => setSelectedKey(null)}
              onChanged={() => void load()}
              onStartMeeting={use3d ? (id) => void startMeeting(id) : undefined}
              onSimulateLoading={
                use3d
                  ? (sim) => {
                      setLoadingSim(sim);
                      setSimPlaying(true);
                    }
                  : undefined
              }
              onFocusLocation={(id) => {
                const key = `STOCK_LOCATION:${id}`;
                if (data?.items.some((i) => i.key === key)) select(key);
                else toast.info("Cet emplacement n'est pas représenté dans la scène (emplacement système)");
              }}
            />
          </div>
        ) : null}
      </div>

      {siteEditor && data ? (
        <SiteEditor
          data={data}
          onClose={() => setSiteEditor(false)}
          onSaved={load}
          renderPreview={(plan) =>
            webgl?.supported ? (
              <SceneErrorBoundary onError={(m) => toast.error(`Aperçu 3D indisponible : ${m}`)}>
                <WorldScene data={{ ...data, sitePlan: plan }} selectedKey={null} highlighted={new Set()} focus={{ kind: "overview" }} editMode={false} onSelect={() => undefined} onMove={() => undefined} onContextLost={() => toast.error("Le contexte WebGL a été perdu")} quality={quality} lighting={lighting} />
              </SceneErrorBoundary>
            ) : (
              <div className="p-6">
                <Alert tone="warning" title="Aperçu 3D indisponible">
                  {webgl?.reason ?? "WebGL n'est pas disponible sur ce poste."}
                </Alert>
              </div>
            )
          }
        />
      ) : null}
    </div>
  );
}
