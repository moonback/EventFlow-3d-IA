/**
 * Géographie simplifiée de la France métropolitaine pour la carte des missions (aucun appel externe).
 * Les coordonnées sont approximatives (centre-ville, préfecture) : suffisantes pour situer une mission
 * sur une carte schématique, pas pour de la navigation.
 */

export type LatLon = [number, number];

/** Contour schématique de la France continentale (lon, lat), sens horaire depuis Dunkerque. */
export const FRANCE_OUTLINE: [number, number][] = [
  [2.37, 51.05], [3.1, 50.78], [3.7, 50.35], [4.2, 50.1], [4.83, 50.15], [5.4, 49.65], [5.9, 49.5], [6.6, 49.4], [7.3, 49.15], [8.2, 48.97],
  [7.8, 48.5], [7.55, 47.9], [7.55, 47.55], [7.0, 47.45], [6.9, 47.1], [6.1, 46.55], [6.1, 46.25], [6.8, 46.4], [7.0, 45.9], [7.15, 45.25],
  [6.65, 45.05], [6.95, 44.55], [6.9, 44.25], [7.5, 43.95], [7.5, 43.78], [7.0, 43.55], [6.65, 43.25], [6.2, 43.1], [5.4, 43.2], [4.85, 43.38],
  [4.2, 43.45], [3.55, 43.3], [3.05, 43.05], [3.05, 42.6], [3.15, 42.45], [2.5, 42.35], [1.75, 42.5], [0.7, 42.8], [-0.3, 42.82], [-1.0, 43.05],
  [-1.78, 43.37], [-1.45, 43.9], [-1.25, 44.6], [-1.15, 45.15], [-1.05, 45.6], [-1.2, 45.85], [-1.15, 46.16], [-1.8, 46.5], [-2.15, 46.9], [-2.2, 47.27],
  [-2.7, 47.5], [-3.5, 47.7], [-4.37, 47.8], [-4.5, 48.05], [-4.77, 48.35], [-4.5, 48.6], [-3.8, 48.72], [-3.0, 48.82], [-2.3, 48.65], [-1.6, 48.65],
  [-1.55, 49.0], [-1.85, 49.4], [-1.94, 49.72], [-1.25, 49.7], [-1.1, 49.4], [-0.2, 49.3], [0.1, 49.5], [0.6, 49.85], [1.1, 49.95], [1.6, 50.25],
  [1.6, 50.75], [1.85, 50.95],
];

/** Contour schématique de la Corse. */
export const CORSICA_OUTLINE: [number, number][] = [
  [9.4, 43.0], [9.5, 42.6], [9.55, 42.1], [9.4, 41.6], [9.2, 41.37], [8.8, 41.6], [8.6, 41.9], [8.6, 42.25], [8.75, 42.57], [9.3, 42.68],
];

/** Grandes villes et lieux événementiels fréquents (lat, lon). Clés normalisées (voir `normalize`). */
const CITIES: Record<string, LatLon> = {
  paris: [48.857, 2.352], "saint denis": [48.936, 2.357], montreuil: [48.862, 2.443], creteil: [48.79, 2.455], villepinte: [48.962, 2.533],
  rambouillet: [48.644, 1.83], chantilly: [49.194, 2.471], versailles: [48.8, 2.13], nanterre: [48.892, 2.207], "boulogne billancourt": [48.835, 2.24],
  "issy les moulineaux": [48.824, 2.27], "la defense": [48.892, 2.236], "marne la vallee": [48.85, 2.78], chessy: [48.872, 2.776], fontainebleau: [48.404, 2.701],
  evry: [48.63, 2.44], cergy: [49.036, 2.076], "roissy en france": [49.004, 2.517], "le bourget": [48.935, 2.425], vincennes: [48.847, 2.439],
  lyon: [45.764, 4.836], villeurbanne: [45.772, 4.88], marseille: [43.296, 5.37], toulouse: [43.605, 1.444], nice: [43.71, 7.262], nantes: [47.218, -1.554],
  strasbourg: [48.573, 7.752], montpellier: [43.61, 3.877], bordeaux: [44.838, -0.579], lille: [50.629, 3.057], rennes: [48.117, -1.678], reims: [49.258, 4.032],
  "le havre": [49.494, 0.108], "saint etienne": [45.44, 4.387], toulon: [43.124, 5.928], grenoble: [45.188, 5.724], dijon: [47.322, 5.041], angers: [47.478, -0.563],
  nimes: [43.837, 4.36], "clermont ferrand": [45.778, 3.087], "le mans": [48.006, 0.199], "aix en provence": [43.53, 5.447], brest: [48.39, -4.486], tours: [47.394, 0.685],
  amiens: [49.894, 2.296], limoges: [45.833, 1.262], annecy: [45.899, 6.129], perpignan: [42.699, 2.895], metz: [49.119, 6.176], besancon: [47.238, 6.024],
  orleans: [47.903, 1.909], rouen: [49.443, 1.1], mulhouse: [47.75, 7.336], caen: [49.183, -0.371], nancy: [48.692, 6.184], avignon: [43.949, 4.806],
  cannes: [43.552, 7.017], antibes: [43.58, 7.125], monaco: [43.738, 7.424], pau: [43.295, -0.371], "la rochelle": [46.16, -1.151], poitiers: [46.58, 0.34],
  bayonne: [43.493, -1.475], biarritz: [43.483, -1.559], ajaccio: [41.919, 8.738], bastia: [42.697, 9.451], calais: [50.95, 1.858], troyes: [48.297, 4.074],
  deauville: [49.36, 0.075], chamonix: [45.924, 6.869], arcachon: [44.658, -1.168], "saint tropez": [43.27, 6.64], "saint malo": [48.649, -2.025],
  vannes: [47.658, -2.76], lorient: [47.748, -3.37], quimper: [47.996, -4.1], "la baule": [47.286, -2.39], colmar: [48.079, 7.358], chambery: [45.566, 5.92],
  valence: [44.933, 4.892], beaune: [47.025, 4.84], epernay: [49.04, 3.96], dunkerque: [51.034, 2.377], arras: [50.29, 2.78], beauvais: [49.43, 2.08],
  chartres: [48.446, 1.489], blois: [47.586, 1.336], bourges: [47.081, 2.399], vichy: [46.127, 3.426], "aix les bains": [45.69, 5.915], megeve: [45.857, 6.618],
};

/** Préfectures par département (lat, lon), pour situer une adresse via son code postal. */
const DEPARTMENTS: Record<string, LatLon> = {
  "01": [46.21, 5.23], "02": [49.56, 3.62], "03": [46.57, 3.33], "04": [44.09, 6.24], "05": [44.56, 6.08], "06": [43.71, 7.26], "07": [44.74, 4.6], "08": [49.77, 4.72],
  "09": [42.97, 1.61], "10": [48.3, 4.07], "11": [43.21, 2.35], "12": [44.35, 2.57], "13": [43.3, 5.37], "14": [49.18, -0.37], "15": [44.93, 2.44], "16": [45.65, 0.16],
  "17": [46.16, -1.15], "18": [47.08, 2.4], "19": [45.27, 1.77], "21": [47.32, 5.04], "22": [48.51, -2.76], "23": [46.17, 1.87], "24": [45.18, 0.72], "25": [47.24, 6.02],
  "26": [44.93, 4.89], "27": [49.02, 1.15], "28": [48.44, 1.49], "29": [48.0, -4.1], "30": [43.84, 4.36], "31": [43.6, 1.44], "32": [43.65, 0.59], "33": [44.84, -0.58],
  "34": [43.61, 3.88], "35": [48.11, -1.68], "36": [46.81, 1.69], "37": [47.39, 0.69], "38": [45.19, 5.72], "39": [46.67, 5.55], "40": [43.89, -0.5], "41": [47.59, 1.33],
  "42": [45.44, 4.39], "43": [45.04, 3.88], "44": [47.22, -1.55], "45": [47.9, 1.91], "46": [44.45, 1.44], "47": [44.2, 0.62], "48": [44.52, 3.5], "49": [47.47, -0.55],
  "50": [49.12, -1.09], "51": [48.96, 4.36], "52": [48.11, 5.14], "53": [48.07, -0.77], "54": [48.69, 6.18], "55": [48.77, 5.16], "56": [47.66, -2.76], "57": [49.12, 6.18],
  "58": [46.99, 3.16], "59": [50.63, 3.06], "60": [49.43, 2.08], "61": [48.43, 0.09], "62": [50.29, 2.78], "63": [45.78, 3.09], "64": [43.3, -0.37], "65": [43.23, 0.08],
  "66": [42.7, 2.9], "67": [48.57, 7.75], "68": [48.08, 7.36], "69": [45.76, 4.84], "70": [47.62, 6.15], "71": [46.31, 4.83], "72": [48.0, 0.2], "73": [45.57, 5.92],
  "74": [45.9, 6.13], "75": [48.86, 2.35], "76": [49.44, 1.1], "77": [48.54, 2.66], "78": [48.8, 2.13], "79": [46.32, -0.46], "80": [49.89, 2.3], "81": [43.93, 2.15],
  "82": [44.02, 1.35], "83": [43.12, 5.93], "84": [43.95, 4.81], "85": [46.67, -1.43], "86": [46.58, 0.34], "87": [45.83, 1.26], "88": [48.17, 6.45], "89": [47.8, 3.57],
  "90": [47.64, 6.86], "91": [48.63, 2.44], "92": [48.89, 2.21], "93": [48.91, 2.44], "94": [48.79, 2.46], "95": [49.04, 2.08], "2A": [41.92, 8.74], "2B": [42.7, 9.45],
};

/** Normalise un nom de ville : minuscules, sans accents, tirets et apostrophes en espaces, « St » → « saint ». */
export function normalize(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’\-]/g, " ")
    .replace(/\bste?\b/g, (m) => (m === "st" ? "saint" : "sainte"))
    .replace(/\s+/g, " ")
    .trim();
}

/** Département d'un code postal (Corse : 2A / 2B ; outre-mer non représenté). */
export function departmentOf(postalCode: string | null | undefined): string | null {
  const cp = (postalCode ?? "").replace(/\s/g, "");
  if (!/^\d{5}$/.test(cp)) return null;
  if (cp.startsWith("97") || cp.startsWith("98")) return null;
  if (cp.startsWith("20")) return Number(cp) < 20200 ? "2A" : "2B";
  return cp.slice(0, 2);
}

/**
 * Situe une adresse : d'abord par la ville (table des villes), sinon par la préfecture du département
 * déduit du code postal. `precision` indique la fiabilité de la position.
 */
export function locate(city: string | null | undefined, postalCode?: string | null): { lat: number; lon: number; precision: "city" | "department" } | null {
  const byCity = city ? CITIES[normalize(city)] : undefined;
  if (byCity) return { lat: byCity[0], lon: byCity[1], precision: "city" };
  const dept = departmentOf(postalCode);
  const byDept = dept ? DEPARTMENTS[dept] : undefined;
  if (byDept) return { lat: byDept[0], lon: byDept[1], precision: "department" };
  return null;
}
