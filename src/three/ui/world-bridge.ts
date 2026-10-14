/**
 * Pont entre Eric et le monde 3D : traduit les commandes de scène (`world_call`) en actions sur
 * l'état de WorldShell. Les dépendances sont injectées (testable sans WebGL) ; chaque commande
 * renvoie un résultat factuel, pour qu'Eric ne prétende jamais avoir montré un objet absent.
 */
import { TZDate } from "@date-fns/tz";
import type { WorldBridge } from "@/assistant/use-assistant";
import { resolveSceneTarget } from "@/features/assistant/scene-targets";
import type { WorldResult } from "@/features/assistant/world-tools";
import { ZONES } from "@/features/scene/layout";
import type { SceneData, SceneItem } from "@/features/scene/types";
import type { FocusTarget } from "../scenes/world-scene";

/** Où se tient Eric : position au sol, point regardé, geste de désignation. */
export interface EricSpot {
  position: [number, number];
  lookAt: [number, number, number] | null;
  pointing: boolean;
}

// Poste d'Eric : dans la salle de contrôle, devant l'hologramme, face aux caméras de zone et d'ensemble
export const ERIC_HOME: EricSpot = { position: [-34.5, 12], lookAt: null, pointing: false };

export interface WorldBridgeState {
  data: SceneData | null;
  mode: "3d" | "plan";
  overlay: "heat" | "count" | null;
  selectedKey: string | null;
  webgl: boolean;
  walk: boolean;
  editMode: boolean;
  siteEditor: boolean;
}

export interface WorldBridgeDeps {
  getState(): WorldBridgeState;
  select(key: string): void;
  setFocus(focus: FocusTarget): void;
  setHighlighted(keys: Set<string>): void;
  setMode(mode: "3d" | "plan"): void;
  setOverlay(overlay: "heat" | "count" | null): void;
  /** Localise un matériel (mise en évidence + chemin) : nombre d'emplacements trouvés */
  locate(query: string): Promise<{ product: string | null; locations: number }>;
  startMeeting(eventId: string): Promise<void>;
  /** Lance la simulation de chargement ; renvoie le nom de l'événement, ou null sans plan de chargement */
  simulateLoading(item: SceneItem): Promise<string | null>;
  moveEric(spot: EricSpot): void;
}

const fail = (error: Extract<WorldResult, { ok: false }>["error"], message: string, suggestions?: string[]): WorldResult => ({ ok: false, error, message, ...(suggestions?.length ? { suggestions } : {}) });

const summary = (i: SceneItem) => ({
  key: i.key,
  kind: i.kind,
  label: i.label,
  ...(i.sublabel ? { sublabel: i.sublabel } : {}),
  zone: i.zone,
  status: i.status,
});

/** Axe horizontal du cadrage d'un objet (caméra en x+7, z+11 : voir CameraRig), normalisé */
const VIEW = { x: 7 / Math.hypot(7, 11), z: 11 / Math.hypot(7, 11) };

/**
 * Place Eric à droite de l'objet tel que la caméra le cadre (perpendiculaire à l'axe de vue, un peu
 * vers la caméra), tourné vers lui : visible à côté de l'objet, sans le masquer.
 */
export function spotNear(item: SceneItem): EricSpot {
  const [x, , z] = item.position;
  const side = (item.kind === "VEHICLE" || item.kind === "DOCK" ? 3.6 : 2.4) * item.scale;
  const forward = 0.8;
  const px = x + VIEW.z * side + VIEW.x * forward;
  const pz = z - VIEW.x * side + VIEW.z * forward;
  return { position: [Math.round(px * 100) / 100, Math.round(pz * 100) / 100], lookAt: [x, 1.2, z], pointing: true };
}

export function spotInZone(zoneId: string): EricSpot {
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) return ERIC_HOME;
  return { position: [zone.center[0] + 2, zone.center[1] + zone.size[1] / 2 - 3], lookAt: null, pointing: false };
}

/** Nombre de jours entre aujourd'hui et `date` (AAAA-MM-JJ), dans le fuseau du site. */
export function dayOffset(date: string, now: Date, timezone: string) {
  const today = new TZDate(now.getTime(), timezone);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000);
}

export function createWorldBridge(deps: WorldBridgeDeps): WorldBridge {
  return async (name, args) => {
    const s = deps.getState();
    if (!s.data) return fail("UNAVAILABLE", "La scène est encore en cours de chargement");
    if (s.siteEditor) return fail("UNAVAILABLE", "L'utilisateur modifie le plan du site : la scène est masquée");
    const data = s.data;
    const cameraBusy = s.walk ? "L'utilisateur visite le site à pied : il pilote lui-même la caméra" : s.editMode ? "L'utilisateur est en mode agencement : la caméra est réservée au déplacement des objets" : null;
    const resolve = (target: string, kinds?: SceneItem["kind"][]) => resolveSceneTarget(data.items, target, kinds);

    switch (name) {
      case "show_object": {
        if (cameraBusy) return fail("UNAVAILABLE", cameraBusy);
        const r = resolve(String(args.target));
        if ("error" in r) return fail(r.error, r.error === "AMBIGUOUS" ? "Plusieurs objets correspondent : précise lequel" : "Aucun objet de la scène ne correspond", r.suggestions);
        deps.select(r.item.key);
        deps.moveEric(spotNear(r.item)); // avatar 3D ou pastille du plan 2D
        return { ok: true, shown: summary(r.item), metrics: r.item.metrics?.slice(0, 6), alerts: r.item.alerts?.slice(0, 4) };
      }
      case "go_to_zone": {
        if (cameraBusy) return fail("UNAVAILABLE", cameraBusy);
        const zone = String(args.zone);
        if (zone === "OVERVIEW") {
          deps.setFocus({ kind: "overview" });
          deps.moveEric(ERIC_HOME);
          return { ok: true, view: "vue d'ensemble" };
        }
        const def = ZONES.find((z) => z.id === zone);
        if (!def) return fail("INVALID_ARGUMENTS", `Zone inconnue : ${zone}`);
        deps.setFocus({ kind: "zone", zone });
        deps.moveEric(spotInZone(zone));
        return { ok: true, zone: def.label, objects: data.items.filter((i) => i.zone === zone).length };
      }
      case "highlight": {
        const targets = (args.targets as string[] | undefined) ?? [];
        const status = args.status as SceneItem["status"] | undefined;
        if (!targets.length && !status) {
          deps.setHighlighted(new Set());
          return { ok: true, cleared: true };
        }
        const keys = new Set<string>();
        const unknown: string[] = [];
        for (const t of targets) {
          const r = resolve(t);
          if ("item" in r) keys.add(r.item.key);
          else unknown.push(t);
        }
        if (status) for (const i of data.items) if (i.status === status) keys.add(i.key);
        if (!keys.size) return fail("UNKNOWN_OBJECT", "Aucun objet de la scène ne correspond");
        deps.setHighlighted(keys);
        return { ok: true, highlighted: [...keys].slice(0, 12).map((k) => data.items.find((i) => i.key === k)!.label), count: keys.size, ...(unknown.length ? { notFound: unknown } : {}) };
      }
      case "locate_equipment": {
        if (cameraBusy) return fail("UNAVAILABLE", cameraBusy);
        const r = await deps.locate(String(args.query));
        if (!r.product) return fail("UNKNOWN_OBJECT", "Aucun matériel ne correspond");
        if (!r.locations) return fail("UNKNOWN_OBJECT", `${r.product} : aucun exemplaire dans les emplacements représentés (sorti ou en zone système)`);
        deps.moveEric(spotInZone("WAREHOUSE"));
        return { ok: true, product: r.product, locations: r.locations };
      }
      case "set_view": {
        const mode = args.mode as "3d" | "plan" | undefined;
        const overlay = args.overlay as "heat" | "count" | "none" | undefined;
        if (mode === "3d" && !s.webgl) return fail("UNAVAILABLE", "La 3D n'est pas disponible sur ce poste (WebGL)");
        if (mode) deps.setMode(mode);
        if (overlay) deps.setOverlay(overlay === "none" ? null : overlay);
        return { ok: true, mode: mode ?? s.mode, overlay: overlay ?? s.overlay ?? "none" };
      }
      case "show_timeline": {
        if (cameraBusy) return fail("UNAVAILABLE", cameraBusy);
        if (s.mode !== "3d") return fail("UNAVAILABLE", "La frise n'est visible qu'en 3D");
        const day = dayOffset(String(args.date), new Date(), data.site.timezone);
        if (day < -14 || day > 60) return fail("INVALID_ARGUMENTS", "La frise couvre de 14 jours avant à 60 jours après aujourd'hui");
        deps.setFocus({ kind: "timeline", day });
        deps.moveEric(spotInZone("EVENTS"));
        return { ok: true, daysFromToday: day };
      }
      case "start_meeting": {
        if (s.mode !== "3d") return fail("UNAVAILABLE", "La salle de réunion n'est visible qu'en 3D");
        if (cameraBusy) return fail("UNAVAILABLE", cameraBusy);
        const r = resolve(String(args.event), ["EVENT"]);
        if ("error" in r) return fail(r.error, "Aucun événement de la scène ne correspond", r.suggestions);
        await deps.startMeeting(r.item.businessId);
        deps.moveEric(spotInZone("OFFICE"));
        return { ok: true, event: r.item.label };
      }
      case "simulate_loading": {
        if (s.mode !== "3d") return fail("UNAVAILABLE", "La simulation n'est visible qu'en 3D");
        if (cameraBusy) return fail("UNAVAILABLE", cameraBusy);
        const r = resolve(String(args.vehicle), ["VEHICLE"]);
        if ("error" in r) return fail(r.error, "Aucun véhicule de la scène ne correspond", r.suggestions);
        const event = await deps.simulateLoading(r.item);
        if (!event) return fail("FAILED", `${r.item.label} n'a pas de plan de chargement pour sa mission`);
        deps.moveEric(spotNear(r.item));
        return { ok: true, vehicle: r.item.label, event };
      }
      case "get_scene": {
        const q = args.query ? String(args.query) : null;
        let items = data.items.filter((i) => (!args.kind || i.kind === args.kind) && (!args.status || i.status === args.status));
        if (q) {
          const r = resolveSceneTarget(items, q);
          items = "item" in r ? [r.item] : items.filter((i) => r.suggestions.some((sug) => sug.startsWith(i.label)));
        }
        const selected = data.items.find((i) => i.key === s.selectedKey);
        return {
          ok: true,
          view: { mode: s.mode, overlay: s.overlay ?? "none", selected: selected ? summary(selected) : null, walking: s.walk, arranging: s.editMode },
          total: items.length,
          objects: items.slice(0, 30).map(summary),
        };
      }
      default:
        return fail("UNKNOWN_TOOL", `Commande inconnue : ${name}`);
    }
  };
}
