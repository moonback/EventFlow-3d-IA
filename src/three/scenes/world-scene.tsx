"use client";
import { CameraControls, ContactShadows, Environment, Lightformer, TransformControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Building2, Gauge, Star, Truck, Warehouse, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { OFFICE_FURNITURE, TIMELINE, timelineX, ZONES } from "@/features/scene/layout";
import type { LoadingSimulation, SceneData, SceneItem } from "@/features/scene/types";
import { AnimationContext, MotionContext, useAnimationSettings } from "../effects/motion";
import { AlertMarker } from "../objects/alert-marker";
import { FlowPaths } from "../objects/flow-paths";
import { footprint } from "../objects/footprint";
import { HoverCard, HoverCardProjector, KIND_LABELS } from "../objects/hover-card";
import { SelectionRing } from "../objects/selection-ring";
import { StatusBeacon } from "../objects/status-beacon";
import { WorldEnvironment } from "../objects/environment";
import { EventMiniature } from "../objects/event-miniature";
import { Timeline } from "../objects/timeline";
import { Interactive } from "../objects/interactive";
import { KpiScreen } from "../objects/kpi-screen";
import { CountMarkers, EventLinks, HeatTiles, PreparationFlows } from "../objects/overlays";
import { Area, Rack } from "../objects/rack";
import { RoutePath } from "../objects/route-path";
import { Dock, Vehicle } from "../objects/vehicle";
import { MissionMap } from "../objects/mission-map";
import { InvoiceSafe, MeetingScreen, MeetingTable, QuoteMailbox, type MeetingData } from "../objects/office-furniture";
import { SceneModeContext, useSceneMode } from "../objects/scene-mode";
import { StaffDesk } from "../objects/office";
import { PresenceAvatars, PresenceSync, type PresenceUser } from "../objects/presence";
import { WalkControls } from "./walk-controls";
import { SitePlanView } from "../site/site-plan-view";
import { WeekBoard } from "../objects/week-board";
import { Eric, type EricProps } from "../objects/eric";
import { AmbienceContext, computeAmbience, useAppTheme, type Ambience } from "../materials/ambience";
import { setGlowBoost, STATUS_COLORS, STATUS_LABELS } from "../materials/palette";
import type { Lighting, Quality } from "../ui/quality";

export type CameraReader = () => { position: [number, number, number]; target: [number, number, number] };

/** Expose au shell une fonction qui lit la position de la caméra et le point visé. */
function CameraProbe({ probe, walking }: { probe: RefObject<CameraReader | null>; walking: boolean }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const target = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const round = (v: THREE.Vector3) => [v.x, v.y, v.z].map((n) => Math.round(n * 10) / 10) as [number, number, number];
    probe.current = () => {
      const { camera, controls } = get();
      const c = controls as unknown as { getTarget?: (out: THREE.Vector3) => THREE.Vector3 } | null;
      if (!walking && c?.getTarget) c.getTarget(target);
      else target.copy(camera.position).add(camera.getWorldDirection(dir).multiplyScalar(6));
      return { position: round(camera.position), target: round(target) };
    };
    return () => {
      probe.current = null;
    };
  }, [get, probe, walking]);
  return null;
}

export type FocusTarget = { kind: "zone"; zone: string } | { kind: "item"; key: string } | { kind: "overview" } | { kind: "timeline"; day: number } | { kind: "view"; position: [number, number, number]; target: [number, number, number] };

interface Props {
  data: SceneData;
  selectedKey: string | null;
  highlighted: Set<string>;
  focus: FocusTarget;
  editMode: boolean;
  onSelect: (key: string | null) => void;
  onMove: (key: string, position: [number, number, number]) => void;
  onContextLost: () => void;
  /** Objet vers lequel tracer le chemin « GPS » depuis l'entrée de l'entrepôt */
  routeTo?: string | null;
  /** Calque d'analyse : carte de chaleur des sorties ou inventaire tournant du jour */
  overlay?: "heat" | "count" | null;
  /** Qualité graphique : ombres, résolution, ombres de contact */
  quality?: Quality;
  /** Éclairage : heure réelle du site, ou jour / nuit forcés */
  lighting?: Lighting;
  /** Visite à la première personne (remplace les contrôles orbitaux) */
  walk?: boolean;
  onExitWalk?: () => void;
  /** Agencement : positions / rotations en attente d'enregistrement, aimantation à la grille (m) */
  overrides?: Map<string, { position: [number, number, number]; rotationY: number }>;
  snap?: number | null;
  /** Simulation de chargement en cours (véhicule ouvert, blocs par étape) */
  loadingSim?: LoadingSimulation | null;
  /** Réunion en cours : dossier de l'événement affiché sur l'écran de la salle de réunion */
  meeting?: MeetingData | null;
  /** Présence des collègues : partage de mon point de vue et affichage du leur */
  presence?: { page: string; others: PresenceUser[]; onOthers: (others: PresenceUser[]) => void } | null;
  /** Lecture du point de vue courant (enregistrement / partage d'un point de vue) */
  cameraProbe?: RefObject<CameraReader | null>;
  /** Assistant vocal Eric, présent dans la scène (absent si l'assistant n'est pas activé) */
  eric?: EricProps | null;
  /** Prévenu quand la qualité est réduite automatiquement faute de performances */
  onQualityDegraded?: (effective: Quality) => void;
  /** Affiche des pastilles cliquables au-dessus de chaque zone (vue tableau de bord). */
  onZoneClick?: (zone: string) => void;
}

const ZONE_BADGES: Record<string, { label: string; icon: LucideIcon }> = {
  OFFICE: { label: "Bureaux", icon: Building2 },
  WAREHOUSE: { label: "Entrepôt", icon: Warehouse },
  LOGISTICS: { label: "Camions", icon: Truck },
  EVENTS: { label: "Événement", icon: Star },
  CONTROL: { label: "Contrôle", icon: Gauge },
};

type BadgeElements = RefObject<Map<string, HTMLElement>>;

/** Projette à chaque image rendue l'ancre 3D de chaque zone vers l'écran et y positionne sa pastille HTML. */
function ZoneBadgeProjector({ elements }: { elements: BadgeElements }) {
  const anchors = useMemo(() => ZONES.map((z) => [z.id, new THREE.Vector3(z.center[0], 7, z.center[1] - z.size[1] / 4)] as const), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const [id, anchor] of anchors) {
      const el = elements.current.get(id);
      if (!el) continue;
      v.copy(anchor).project(camera);
      el.style.visibility = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 ? "visible" : "hidden";
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`;
    }
  });
  return null;
}

function ZoneBadges({ elements, onZoneClick }: { elements: BadgeElements; onZoneClick: (zone: string) => void }) {
  return ZONES.map((z) => {
    const badge = ZONE_BADGES[z.id];
    if (!badge) return null;
    const Icon = badge.icon;
    return (
      <button
        key={z.id}
        type="button"
        ref={(el) => {
          if (el) elements.current.set(z.id, el);
          else elements.current.delete(z.id);
        }}
        onClick={() => onZoneClick(z.id)}
        style={{ background: `${z.color}cc`, borderColor: z.color, boxShadow: `0 0 24px -4px ${z.color}`, visibility: "hidden" }}
        className="absolute top-0 left-0 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white shadow-lg backdrop-blur transition-[filter] hover:brightness-125"
      >
        <span className="flex size-5 items-center justify-center rounded bg-white/90" style={{ color: z.color }}>
          <Icon className="size-3.5" aria-hidden />
        </span>
        {badge.label}
      </button>
    );
  });
}

const ALERT_HEIGHT: Partial<Record<SceneItem["kind"], number>> = { STOCK_LOCATION: 5.6, VEHICLE: 5.9 };

function ItemObject({ item, active, highlighted, simulation }: { item: SceneItem; active: boolean; highlighted: boolean; simulation?: LoadingSimulation | null }) {
  const height = item.variant === "rack" ? 5.6 : item.kind === "STOCK_LOCATION" ? 3.9 : ALERT_HEIGHT[item.kind];
  return (
    <>
      <ItemBody item={item} active={active} highlighted={highlighted} simulation={simulation} />
      {item.alerts?.length && height ? <AlertMarker item={item} height={height} /> : null}
    </>
  );
}

/** Repères communs à tous les objets : anneau (sélection / survol / recherche) et balise d'état. */
function ItemMarkers({ item, active, highlighted, hovered }: { item: SceneItem; active: boolean; highlighted: boolean; hovered: boolean }) {
  const { radius, top } = footprint(item);
  // Balise pour les objets en alerte ou à surveiller, sauf s'ils portent déjà un panneau d'alerte détaillé.
  // Un événement « à préparer » est un état normal : seule l'alerte mérite une balise.
  const beacon = !item.alerts?.length && (item.status === "danger" || (item.status === "warning" && item.kind !== "EVENT"));
  return (
    <>
      <SelectionRing radius={radius} visible={active || highlighted || hovered} color={active ? "#a5b4fc" : highlighted ? "#fbbf24" : "#e2e8f0"} opacity={active || highlighted ? 0.9 : 0.4} pulse={active || highlighted} />
      {beacon ? <StatusBeacon color={STATUS_COLORS[item.status]} top={top} radius={radius} urgent={item.status === "danger"} /> : null}
    </>
  );
}

function MeetingTableItem({ item, active }: { item: SceneItem; active: boolean }) {
  const { meeting } = useSceneMode();
  return <MeetingTable item={item} active={active} meeting={meeting} />;
}

function ItemBody({ item, active, highlighted, simulation }: { item: SceneItem; active: boolean; highlighted: boolean; simulation?: LoadingSimulation | null }) {
  switch (item.kind) {
    case "STOCK_LOCATION":
      return item.variant === "rack" ? <Rack item={item} active={active} highlighted={highlighted} /> : <Area item={item} active={active} highlighted={highlighted} />;
    case "VEHICLE":
      return <Vehicle item={item} active={active} simulation={simulation} />;
    case "DOCK":
      return <Dock item={item} active={active} />;
    case "EVENT":
      return <EventMiniature item={item} active={active} />;
    case "STAFF_DESK":
      return <StaffDesk item={item} active={active} />;
    case "MISSION_MAP":
      return <MissionMap item={item} active={active} />;
    case "MEETING_TABLE":
      return <MeetingTableItem item={item} active={active} />;
    case "QUOTE_MAILBOX":
      return <QuoteMailbox item={item} active={active} />;
    case "INVOICE_SAFE":
      return <InvoiceSafe item={item} active={active} />;
    case "CALENDAR_BOARD":
      return item.week ? <WeekBoard item={item} active={active} /> : <KpiScreen item={item} active={active} />;
    default:
      return <KpiScreen item={item} active={active} />;
  }
}

function CameraRig({ data, focus, keyboardKey }: { data: SceneData; focus: FocusTarget; keyboardKey: string | null }) {
  const ref = useRef<CameraControls>(null);
  // Navigation au clavier : la caméra rejoint l'objet qui a le focus (sans revenir en arrière à la perte du focus)
  useEffect(() => {
    const item = keyboardKey ? data.items.find((i) => i.key === keyboardKey) : null;
    if (item && ref.current) void ref.current.setLookAt(item.position[0] + 7, 9, item.position[2] + 11, item.position[0], 1, item.position[2], true);
  }, [keyboardKey, data.items]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (focus.kind === "overview") {
      void c.setLookAt(10, 70, 85, 0, 0, 8, true);
      return;
    }
    if (focus.kind === "view") {
      // Rejoindre le point de vue d'un collègue
      void c.setLookAt(...focus.position, ...focus.target, true);
      return;
    }
    if (focus.kind === "timeline") {
      // Voyage dans le temps : la caméra glisse le long de la frise jusqu'au jour choisi
      const x = timelineX(new Date(new Date(data.generatedAt).getTime() + focus.day * 86_400_000), data.generatedAt);
      const zc = (TIMELINE.axisZ + TIMELINE.lanes[TIMELINE.lanes.length - 1]!) / 2;
      void c.setLookAt(x + 2, 15, zc + 20, x, 0, zc, true);
      return;
    }
    if (focus.kind === "zone") {
      const z = ZONES.find((x) => x.id === focus.zone);
      if (z) void c.setLookAt(z.center[0] + 6, Math.max(z.size[0], z.size[1]) * 0.9, z.center[1] + Math.max(z.size[0], z.size[1]) * 0.85, z.center[0], 0, z.center[1], true);
      return;
    }
    const item = data.items.find((i) => i.key === focus.key);
    if (item) {
      const [x, , z] = item.position;
      void c.setLookAt(x + 7, 9, z + 11, x, 1, z, true);
    }
  }, [focus, data.items, data.generatedAt]);
  return <CameraControls ref={ref} makeDefault minDistance={6} maxDistance={160} maxPolarAngle={Math.PI / 2.15} dollySpeed={0.6} smoothTime={0.35} />;
}

const ZONE_ORDER = ["OFFICE", "CONTROL", "WAREHOUSE", "LOGISTICS", "EVENTS"];
const describe = (i: SceneItem) => `${KIND_LABELS[i.kind]} ${i.label}${i.sublabel ? `, ${i.sublabel}` : ""}, état : ${STATUS_LABELS[i.status]}${i.alerts?.length ? `, ${i.alerts.length} alerte(s)` : ""}`;

const SHADOW_SIZE: Record<Quality, number> = { low: 0, medium: 1024, high: 2048 };
const MAX_DPR: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };

/** Active la projection / réception d'ombres sur les objets opaques (rejoué quand les données changent). */
function ShadowCasters({ enabled, version }: { enabled: boolean; version: string }) {
  const { scene, invalidate } = useThree();
  useEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.Material;
      const opaque = !Array.isArray(mat) && !mat.transparent && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial;
      mesh.castShadow = enabled && opaque;
      mesh.receiveShadow = enabled && (opaque || mesh.geometry?.type === "PlaneGeometry");
    });
    invalidate();
  }, [scene, enabled, version, invalidate]);
  return null;
}

/**
 * Qualité adaptative : la scène est rendue à la demande, on ne mesure donc que les séquences d'images
 * continues (animations, déplacements de caméra). Si la cadence moyenne passe sous 24 i/s, on dégrade d'un cran.
 */
function AdaptiveQuality({ onDecline }: { onDecline: () => void }) {
  const samples = useRef<number[]>([]);
  const declined = useRef(false);
  useFrame((_, delta) => {
    if (declined.current || delta > 0.5) return; // pause entre deux rendus à la demande : ignorée
    samples.current.push(delta);
    if (samples.current.length < 40) return;
    const avg = samples.current.reduce((a, b) => a + b, 0) / samples.current.length;
    samples.current = [];
    if (avg > 1 / 24) {
      declined.current = true;
      onDecline();
    }
  });
  return null;
}

/** Soleil principal : son ombre portée couvre tout le site (le cadrage de la caméra d'ombre est recalculé). */
function SunLight({ shadows, mapSize, ambience }: { shadows: boolean; mapSize: number; ambience: Ambience }) {
  const ref = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const light = ref.current;
    if (!light) return;
    const cam = light.shadow.camera;
    Object.assign(cam, { left: -80, right: 80, top: 70, bottom: -70, near: 10, far: 220 });
    cam.updateProjectionMatrix();
    light.shadow.mapSize.set(mapSize, mapSize);
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.04;
    light.shadow.needsUpdate = true;
  }, [mapSize]);
  const [dx, dy, dz] = ambience.sunDirection;
  return <directionalLight ref={ref} position={[dx * 80, dy * 80, dz * 80]} intensity={ambience.sunIntensity * (shadows ? 1 : 0.85)} color={ambience.sunColor} castShadow={shadows && ambience.daylight > 0.05} />;
}

/**
 * Halo lumineux (qualité élevée) : seules les sources « lumineuses » (balises, néons, lampadaires,
 * enseignes) dépassent le seuil, leur émission étant amplifiée tant que l'effet est actif.
 */
function GlowEffect() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    setGlowBoost(4);
    invalidate();
    return () => setGlowBoost(1);
  }, [invalidate]);
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur luminanceThreshold={1.1} luminanceSmoothing={0.25} intensity={0.9} radius={0.7} />
      <Vignette eskil={false} offset={0.25} darkness={0.55} />
    </EffectComposer>
  );
}

/** Marque la première image rendue (mesure de performance des tests de bout en bout). */
function FirstFrame({ onFirst }: { onFirst: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    onFirst();
  });
  return null;
}

/**
 * Scène 3D : n'écrit jamais en base. La sélection renvoie l'identité métier (type:identifiant)
 * au shell, qui interroge le serveur ; la scène n'est rafraîchie qu'après confirmation serveur.
 */
export default function WorldScene({ data, selectedKey, highlighted, focus, editMode, onSelect, onMove, onContextLost, onZoneClick, routeTo, overlay = null, quality = "medium", lighting = "auto", onQualityDegraded, walk = false, onExitWalk, overrides, snap = null, loadingSim = null, presence = null, meeting = null, cameraProbe, eric = null }: Props) {
  const [keyboardKey, setKeyboardKey] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [firstFrame, setFirstFrame] = useState(false);
  // Le gestionnaire est posé une seule fois à la création du contexte : toujours appeler le dernier rappel
  const onContextLostRef = useRef(onContextLost);
  onContextLostRef.current = onContextLost;
  useEffect(() => setDegraded(false), [quality]); // un nouveau choix de l'utilisateur annule la dégradation automatique
  const effective: Quality = degraded && quality !== "low" ? (quality === "high" ? "medium" : "low") : quality;
  useEffect(() => {
    if (degraded && effective !== quality) onQualityDegraded?.(effective);
  }, [degraded, effective, quality, onQualityDegraded]);
  // Ambiance : thème de l'application × heure réelle du site (recalculée chaque minute)
  const theme = useAppTheme();
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const ambience = useMemo(() => computeAmbience(theme, lighting, new Date(clock), data.site), [theme, lighting, clock, data.site]);
  // Animations continues (balises, flux, anneaux) : coupées en qualité basse et si l'utilisateur préfère un mouvement réduit
  const reducedMotion = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const [animationSettings] = useAnimationSettings();
  const animationContext = useMemo(() => ({ settings: animationSettings, reduced: reducedMotion }), [animationSettings, reducedMotion]);
  // Rendu permanent seulement si au moins une animation continue reste active
  const motion = effective !== "low" && !reducedMotion && (["fleet", "flows", "arcs", "decor", "beacons", "pulses"] as const).some((k) => animationSettings[k]);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const hoverCardRef = useRef<HTMLDivElement>(null);
  const hovered = hoveredKey && hoveredKey !== selectedKey && !editMode && !walk ? (data.items.find((i) => i.key === hoveredKey) ?? null) : null;
  useEffect(() => () => void (document.body.style.cursor = ""), []);
  const sceneMode = useMemo(() => ({ navigate: !editMode, meeting: Boolean(meeting) }), [editMode, meeting]);
  const ordered = useMemo(() => [...data.items].sort((a, b) => ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone) || a.label.localeCompare(b.label, "fr")), [data.items]);
  const selectedItem = useMemo(() => data.items.find((i) => i.key === selectedKey) ?? null, [data.items, selectedKey]);
  const refs = useRef(new Map<string, THREE.Group>());
  const [editTarget, setEditTarget] = useState<THREE.Group | null>(null);
  const routeTarget = useMemo(() => (routeTo ? (data.items.find((i) => i.key === routeTo)?.position ?? null) : null), [routeTo, data.items]);
  const badgeElements = useRef(new Map<string, HTMLElement>());
  const placeable = useMemo(() => new Set(data.items.filter((i) => !["EVENT", "STAFF_DESK", "MISSION_MAP", "MEETING_TABLE", "QUOTE_MAILBOX", "INVOICE_SAFE"].includes(i.kind)).map((i) => i.key)), [data.items]);

  useEffect(() => {
    setEditTarget(editMode && selectedKey && placeable.has(selectedKey) ? (refs.current.get(selectedKey) ?? null) : null);
  }, [editMode, selectedKey, placeable]);

  return (
    <MotionContext.Provider value={motion}>
    <AnimationContext.Provider value={animationContext}>
    <div className="relative h-full w-full overflow-hidden" data-first-frame={firstFrame ? "true" : undefined}>
      <Canvas
        key={effective}
        frameloop={motion ? "always" : "demand"}
        shadows={effective === "low" ? false : "soft"}
        dpr={[1, MAX_DPR[effective]]}
        camera={{ position: [10, 70, 85], fov: 45, near: 0.5, far: 600 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            onContextLostRef.current();
          });
        }}
        onPointerMissed={() => onSelect(null)}
        aria-label="Monde 3D de l'agence"
      >
        <AmbienceContext.Provider value={ambience}>
        <SceneModeContext.Provider value={sceneMode}>
          <color attach="background" args={[ambience.background]} />
          <fog attach="fog" args={[ambience.background, 110, 300]} />
          <hemisphereLight args={[ambience.hemiSky, ambience.hemiGround, ambience.hemiIntensity]} />
          <ambientLight intensity={ambience.ambient * (effective === "low" ? 1.6 : 1)} />
          <SunLight shadows={effective !== "low"} mapSize={SHADOW_SIZE[effective] || 512} ambience={ambience} />
          <directionalLight position={[40, 30, -30]} intensity={0.2 + ambience.daylight * 0.15} color="#93c5fd" />
          <WorldEnvironment realLights={effective !== "low"} movementsToday={data.activity?.movementsToday ?? 0} />
          <FlowPaths />
          <SitePlanView plan={data.sitePlan} walk={walk} night={ambience.night} />
          {/* Reflets d'ambiance générés localement (aucune texture HDR téléchargée) */}
          {effective !== "low" ? (
            <Environment resolution={128} frames={1} environmentIntensity={0.25 + ambience.daylight * 0.25}>
              <Lightformer intensity={2} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[40, 40, 1]} color="#c7d2fe" />
              <Lightformer intensity={1.4} position={[-25, 6, -10]} rotation-y={Math.PI / 2} scale={[30, 5, 1]} color="#38bdf8" />
              <Lightformer intensity={1.1} position={[25, 6, 10]} rotation-y={-Math.PI / 2} scale={[30, 5, 1]} color="#f472b6" />
            </Environment>
          ) : null}
          {hovered ? <HoverCardProjector item={hovered} element={hoverCardRef} /> : null}
          {effective === "high" ? <GlowEffect /> : null}
          <Timeline now={data.generatedAt} />
          <ShadowCasters enabled={effective !== "low"} version={`${data.generatedAt}|${effective}`} />
          {effective === "high" ? <ContactShadows key={data.generatedAt} position={[0, 0.01, 0]} scale={200} resolution={1024} far={8} blur={2.5} opacity={0.55} frames={1} /> : null}
          {effective !== "low" ? <AdaptiveQuality onDecline={() => setDegraded(true)} /> : null}
          <FirstFrame
            onFirst={() => {
              setFirstFrame(true);
              (window as unknown as { __efFirstFrameAt?: number }).__efFirstFrameAt = performance.now();
            }}
          />
          {data.items.map((item) => (
            <Interactive
              key={item.key}
              itemKey={item.key}
              position={overrides?.get(item.key)?.position ?? item.position}
              rotationY={overrides?.get(item.key)?.rotationY ?? item.rotationY}
              scale={item.scale}
              onSelect={(k) => onSelect(k)}
              onHover={(k, on) => setHoveredKey((h) => (on ? k : h === k ? null : h))}
              ref={(g) => {
                if (g) refs.current.set(item.key, g);
                else refs.current.delete(item.key);
              }}
            >
              <ItemObject item={item} active={item.key === selectedKey || item.key === keyboardKey} highlighted={highlighted.has(item.key)} simulation={loadingSim?.vehicleKey === item.key ? loadingSim : null} />
              <ItemMarkers item={item} active={item.key === selectedKey || item.key === keyboardKey} highlighted={highlighted.has(item.key)} hovered={item.key === hoveredKey} />
            </Interactive>
          ))}
          {editTarget ? (
            <TransformControls
              object={editTarget}
              mode="translate"
              showY={false}
              translationSnap={snap}
              onMouseUp={() => {
                const p = editTarget.position;
                if (selectedKey) onMove(selectedKey, [Math.round(p.x * 10) / 10, 0, Math.round(p.z * 10) / 10]);
              }}
            />
          ) : null}
          {routeTarget ? <RoutePath target={routeTarget} /> : null}
          {overlay === "heat" ? <HeatTiles items={data.items} /> : null}
          {overlay === "count" ? <CountMarkers items={data.items} /> : null}
          <EventLinks items={data.items} selectedKey={selectedKey} />
          {eric && !walk ? <Eric {...eric} /> : null}
          <PreparationFlows items={data.items} />
          {presence ? (
            <>
              <PresenceSync page={presence.page} selectedKey={selectedKey} walking={walk} onOthers={presence.onOthers} />
              <PresenceAvatars others={presence.others} />
            </>
          ) : null}
          {onZoneClick ? <ZoneBadgeProjector elements={badgeElements} /> : null}
          {cameraProbe ? <CameraProbe probe={cameraProbe} walking={walk} /> : null}
        {walk ? <WalkControls items={data.items} plan={data.sitePlan} movementsToday={data.activity?.movementsToday ?? 0} onExit={() => onExitWalk?.()} /> : <CameraRig data={data} focus={focus} keyboardKey={keyboardKey} />}
        {meeting ? <MeetingScreen data={meeting} position={[OFFICE_FURNITURE.meetingTable[0], 1.95, OFFICE_FURNITURE.meetingTable[2] - 2.9]} /> : null}
        </SceneModeContext.Provider>
        </AmbienceContext.Provider>
      </Canvas>
      {/* Accessibilité : chaque objet est atteignable au clavier (Tab), Entrée l'ouvre ; la caméra suit le focus */}
      <nav aria-label="Objets de la scène 3D">
        <ul>
          {ordered.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                aria-label={describe(item)}
                aria-pressed={item.key === selectedKey}
                onFocus={() => setKeyboardKey(item.key)}
                onBlur={() => setKeyboardKey((k) => (k === item.key ? null : k))}
                onClick={() => onSelect(item.key)}
                className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-1/2 focus:z-20 focus:-translate-x-1/2 focus:rounded-full focus:bg-primary focus:px-4 focus:py-1.5 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
              >
                {item.label} — Entrée pour ouvrir
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <p aria-live="polite" className="sr-only">
        {selectedItem ? `Sélectionné : ${describe(selectedItem)}` : ""}
      </p>
      {onZoneClick ? <ZoneBadges elements={badgeElements} onZoneClick={onZoneClick} /> : null}
      {hovered ? <HoverCard item={hovered} element={hoverCardRef} /> : null}
    </div>
    </AnimationContext.Provider>
    </MotionContext.Provider>
  );
}
