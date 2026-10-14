/**
 * La conduite : le cycle de vie d'un événement dans EventFlow, présenté comme les cues d'un
 * spectacle. Chaque cue décrit aussi le « programme lumière » joué par les lyres du plateau 3D.
 */

/** Gélatines d'éclairage : la palette de la page d'accueil. */
export const GEL = {
  amber: "#ffb347",
  magenta: "#ff3d8b",
  lavender: "#9c8cff",
  cold: "#d8e6ff",
  cyan: "#4fd1e8",
  green: "#4ade80",
} as const;

export type BeamMode = "fan" | "sweep" | "cross" | "still" | "chase" | "ballyhoo";

export interface LightCue {
  /** Couleur de chaque lyre (6 lyres, de cour à jardin) */
  colors: [string, string, string, string, string, string];
  mode: BeamMode;
  /** Vitesse du mouvement (1 = normale) */
  speed: number;
  /** Intensité des faisceaux (0–1,4) */
  intensity: number;
  /** Deux teintes du mur LED */
  wall: [string, string];
}

export interface Cue {
  id: string;
  /** Jour relatif au show */
  day: string;
  title: string;
  text: string;
  /** Modules de l'application concernés */
  modules: string[];
  light: LightCue;
}

const g = GEL;

/** Avant-show : le plateau au repos, affiché sur la page d'ouverture. */
export const PRESHOW: LightCue = {
  colors: [g.amber, g.magenta, g.lavender, g.lavender, g.magenta, g.amber],
  mode: "fan",
  speed: 0.6,
  intensity: 1,
  wall: [g.lavender, g.magenta],
};

export const CUES: Cue[] = [
  {
    id: "demande",
    day: "J−45",
    title: "La demande arrive",
    text: "Le prospect remplit le formulaire intégré à votre site : date, lieu, invités, budget. La demande entre dans le pipeline et les commerciaux sont prévenus.",
    modules: ["Demandes", "Clients"],
    light: { colors: [g.amber, g.amber, g.amber, g.amber, g.amber, g.amber], mode: "still", speed: 0.3, intensity: 0.8, wall: [g.amber, "#ff7a3d"] },
  },
  {
    id: "devis",
    day: "J−30",
    title: "Le devis part",
    text: "Lignes matériel, prestations et personnel, remises, TVA par taux. Chaque révision crée une nouvelle version ; l'acceptation confirme l'événement.",
    modules: ["Devis", "Événements"],
    light: { colors: [g.lavender, g.cold, g.lavender, g.lavender, g.cold, g.lavender], mode: "fan", speed: 0.5, intensity: 0.95, wall: [g.lavender, g.cold] },
  },
  {
    id: "reservation",
    day: "J−21",
    title: "Le matériel est bloqué",
    text: "La disponibilité tient compte des autres réservations, des tampons de préparation et de retour, et du matériel en maintenance. Pas de double réservation.",
    modules: ["Réservations", "Catalogue & stock"],
    light: { colors: [g.cyan, g.lavender, g.cyan, g.cyan, g.lavender, g.cyan], mode: "cross", speed: 0.7, intensity: 1, wall: [g.cyan, g.lavender] },
  },
  {
    id: "equipe",
    day: "J−10",
    title: "L'équipe confirme",
    text: "Les missions sont proposées aux techniciens et intermittents sur leur portail. Chacun accepte ou refuse, et déclare ses disponibilités.",
    modules: ["Équipe", "Planning"],
    light: { colors: [g.green, g.cold, g.green, g.green, g.cold, g.green], mode: "chase", speed: 0.9, intensity: 1, wall: [g.green, g.cyan] },
  },
  {
    id: "preparation",
    day: "J−2",
    title: "Les flight-cases se remplissent",
    text: "Liste de préparation par emplacement, unités sérialisées pointées, mouvements de stock tracés. Une préparation incomplète déclenche une alerte.",
    modules: ["Logistique", "Entrepôt"],
    light: { colors: [g.cold, g.cold, g.cold, g.cold, g.cold, g.cold], mode: "sweep", speed: 0.8, intensity: 1.1, wall: [g.cold, g.lavender] },
  },
  {
    id: "chargement",
    day: "J−1",
    title: "Le camion est chargé",
    text: "Le plan de chargement place en fond de caisse ce qui sera installé en premier sur site. Volume et charge utile sont vérifiés pour chaque véhicule.",
    modules: ["Véhicules", "Logistique"],
    light: { colors: [g.amber, g.cold, g.amber, g.amber, g.cold, g.amber], mode: "sweep", speed: 1.1, intensity: 1.1, wall: [g.amber, g.lavender] },
  },
  {
    id: "show",
    day: "J",
    title: "Le show",
    text: "Le matériel est sorti, l'équipe est sur site, les coûts tournent. Suivez le déroulé en direct, ou depuis le mur d'écrans du monde 3D.",
    modules: ["Mon univers 3D", "Planning"],
    light: { colors: [g.magenta, g.lavender, g.amber, g.amber, g.lavender, g.magenta], mode: "ballyhoo", speed: 1.6, intensity: 1.35, wall: [g.magenta, g.amber] },
  },
  {
    id: "retour",
    day: "J+1",
    title: "Le retour est contrôlé",
    text: "Quantités revenues, endommagées ou perdues : chaque ligne est pointée. Le matériel abîmé part en maintenance, les pertes sont valorisées.",
    modules: ["Logistique", "Maintenance"],
    light: { colors: [g.lavender, g.lavender, g.cyan, g.cyan, g.lavender, g.lavender], mode: "fan", speed: 0.4, intensity: 0.9, wall: [g.lavender, g.cyan] },
  },
  {
    id: "facture",
    day: "J+7",
    title: "La facture est émise",
    text: "Numéro attribué à l'émission, document figé, avoir en cas de correction. La marge réelle de l'événement apparaît, coûts d'équipe et de transport compris.",
    modules: ["Factures", "Finances"],
    light: { colors: [g.amber, g.amber, g.cold, g.cold, g.amber, g.amber], mode: "still", speed: 0.2, intensity: 0.75, wall: [g.amber, g.cold] },
  },
];
