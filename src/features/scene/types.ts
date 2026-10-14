/** Contrat de données entre le serveur et la scène 3D (DTO sérialisables). */
import type { SitePlan } from "@/features/site-plan/schema";

export type SceneObjectKind = "STOCK_LOCATION" | "VEHICLE" | "DOCK" | "EVENT" | "KPI_SCREEN" | "CALENDAR_BOARD" | "ALERT_BOARD" | "STAFF_DESK" | "MISSION_MAP" | "MEETING_TABLE" | "QUOTE_MAILBOX" | "INVOICE_SAFE";

export interface SceneItem {
  /** Identité stable : `${kind}:${businessId}` */
  key: string;
  kind: SceneObjectKind;
  businessId: string;
  zone: "OFFICE" | "WAREHOUSE" | "LOGISTICS" | "EVENTS" | "CONTROL";
  label: string;
  sublabel?: string;
  position: [number, number, number];
  rotationY: number;
  scale: number;
  variant?: string | null;
  /** Objet positionné explicitement (SceneObject) ou placement par défaut */
  placed: boolean;
  status: "ok" | "info" | "warning" | "danger" | "idle";
  /** Taux de remplissage 0..1 (rayonnages) */
  fill?: number;
  metrics?: { label: string; value: string }[];
  /** Alertes affichées en panneau flottant au-dessus de l'objet (stock bas, échéances véhicule…) */
  alerts?: { level: "warning" | "danger"; message: string }[];
  /** Dates de l'événement (ISO) pour le compte à rebours des pupitres */
  startAt?: string;
  endAt?: string;
  /** Tableau blanc : planning des 7 prochains jours (post-its) */
  week?: { day: string; label: string; events: { id: string; reference: string; name: string; status: string }[] }[];
  /** Inventaire tournant : dernier comptage, comptage à faire aujourd'hui / déjà fait aujourd'hui */
  count?: { lastAt: string | null; today: boolean; done: boolean };
  /** Chargement du véhicule pour sa mission en cours ou la prochaine (volumes en m³) */
  load?: { volume: number; capacity: number; ratio: number; event: string; missingVolumes: number };
  /** Événement : clés des objets liés (emplacements du matériel réservé, véhicules affectés) */
  links?: string[];
  /** Carte de chaleur : unités sorties de l'emplacement sur 90 jours, et intensité 0..1 */
  outflow?: number;
  heat?: number;
  /** Événement : maquette miniature (selon le type), échelle (selon les invités), longueur de la barre de durée (m) */
  miniature?: "stage" | "banquet" | "stands" | "theater" | "arena" | "showcase";
  size?: number;
  span?: number;
  guests?: number | null;
  /** Zone de préparation : réservations en cours de préparation et rayonnages d'où part le matériel restant */
  preparations?: { reference: string; event: string; progress: number; remaining: number; sources: string[] }[];
  /** Carte des missions : siège de l'agence et véhicules affectés, situés à la ville de leur événement */
  map?: {
    hq: { name: string; lat: number; lon: number } | null;
    missions: { vehicleKey: string; vehicle: string; event: string; eventName: string; city: string; lat: number; lon: number; precision: "city" | "department"; onMission: boolean }[];
    unlocated: number;
  };
  /** Écran : mini-graphique (6 derniers mois) */
  chart?: { title: string; labels: string[]; values: number[]; kind: "bars" | "line"; format: "money" | "number" };
  /** Poste de travail : situation du collaborateur maintenant */
  desk?: { state: "available" | "mission" | "leave"; detail: string | null };
  /** Table de réunion : événements à préparer (sélection de la réunion) */
  meeting?: { events: { id: string; reference: string; name: string; startAt: string }[] };
  /** Boîte aux lettres des devis */
  mailbox?: { followUps: number; pending: number; pendingAmount: string; items: { id: string; number: string; customer: string; amount: string; followUp: boolean }[] };
  /** Coffre des factures : créances en retard */
  safe?: { overdueCount: number; overdueAmount: number; unpaidCount: number; unpaidAmount: number; items: { id: string; number: string; customer: string; amount: string; dueDate: string | null }[] };
  /** Lien vers la page 2D correspondante */
  href: string;
}

export interface SceneData {
  generatedAt: string;
  items: SceneItem[];
  counts: { locations: number; vehicles: number; events: number };
  /** Identité du site : nom et couleur de l'organisation (habillage), fuseau et position (course du soleil) */
  site: { name: string; accentColor: string; timezone: string; lat: number; lon: number; located: boolean };
  /** Activité de l'entrepôt aujourd'hui : mouvements de stock depuis minuit (fuseau de l'organisation) */
  activity: { movementsToday: number };
  /** Plan du site (murs, ouvertures, pièces, accessoires) ; révision 0 = plan par défaut jamais enregistré */
  sitePlan: SitePlan;
  sitePlanRevision: number;
}

export interface ScenePanelAction {
  id: string;
  label: string;
  /** Endpoint appelé (toujours une route API serveur qui revalide droits et règles) */
  kind: "link" | "transfer" | "vehicle-status" | "event-status" | "maintenance";
  href?: string;
}

/** Simulation de chargement d'un véhicule : étapes dans l'ordre de chargement et étape courante. */
export interface LoadingSimulation {
  vehicleKey: string;
  event: string;
  step: number;
  steps: { step: number; name: string; quantity: number; volume: number | null; color: string | null; zone: string }[];
}

/** Point de vue enregistré (partagé avec l'organisation). */
export interface SceneBookmark {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  createdByName: string | null;
  canDelete: boolean;
}
