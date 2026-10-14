/**
 * Données de DÉMONSTRATION — organisation fictive « Lumière & Cie Événements (démo) ».
 *
 * - Réexécutable sans doublon : si l'organisation de démo existe, le seed s'arrête
 *   (SEED_RESET=true la supprime puis la recrée).
 * - Refuse de s'exécuter en production sauf ALLOW_DEMO_SEED=true explicite.
 * - Le mot de passe des comptes de démo provient de DEMO_PASSWORD (jamais codé en dur).
 * - Utilise les services métier : stock, journal, réservations et factures restent cohérents.
 *
 * Lancement : npm run db:seed
 */
import { PrismaClient, type Role } from "@prisma/client";
import { loadAuthContext, type AuthContext } from "../src/server/auth/context";
import { hashPassword } from "../src/server/auth/password";
import { zonedLocalToUtc, utcToZonedLocalInput } from "../src/lib/dates";
import { createCustomer as svcCreateCustomer, addAddress, addContact } from "../src/server/services/customer-service";
import { createEvent, changeEventStatus, createTask } from "../src/server/services/event-service";
import { recordManualMovement } from "../src/server/services/stock-movement-service";
import {
  cancelReservation,
  confirmReservation,
  createReservation,
  prepareReservation,
  recordReturn,
  shipReservation,
  submitReservation,
} from "../src/server/services/reservation-service";
import { acceptQuote, createQuote, issueQuote, setQuoteStatus, type DocumentLineData } from "../src/server/services/quote-service";
import { createInvoiceFromQuote, issueInvoice, recordPayment, createExpense } from "../src/server/services/invoice-service";
import { createVehicleAssignment } from "../src/server/services/vehicle-service";
import { createStaffAssignment, addTimesheet } from "../src/server/services/staff-service";
import { createPurchaseOrder, placePurchaseOrder, receivePurchaseOrder } from "../src/server/services/purchase-service";
import { runAlertScan } from "../src/server/services/notification-service";
import { nextDocumentNumber } from "../src/server/services/common";
import { purgeOrganization } from "../src/server/services/organization-admin";

const db = new PrismaClient();
const DEMO_SLUG = "demo-lumiere-cie";
const DEMO_SLUG_2 = "demo-agence-sud";
const TZ = "Europe/Paris";
const DAY = 86_400_000;

function guard() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Seed de démonstration refusé en production (définir ALLOW_DEMO_SEED=true pour forcer, déconseillé).");
  }
  const pwd = process.env.DEMO_PASSWORD;
  if (!pwd || pwd.length < 10 || pwd === "change-me-demo-password") {
    throw new Error("Définissez DEMO_PASSWORD (10 caractères minimum) dans .env avant de lancer le seed.");
  }
  return pwd;
}

/** Instant UTC à J+offset, à l'heure locale donnée (Europe/Paris). */
function at(dayOffset: number, hour: number, minute = 0) {
  const base = new Date(Date.now() + dayOffset * DAY);
  const local = utcToZonedLocalInput(base, TZ).slice(0, 10);
  return zonedLocalToUtc(`${local}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, TZ);
}
const local = (d: Date) => utcToZonedLocalInput(d, TZ);

const USERS: { key: string; name: string; email: string; role: Role }[] = [
  { key: "owner", name: "Camille Laurent", email: "camille.laurent@demo.eventflow.local", role: "OWNER" },
  { key: "admin", name: "Hugo Bernard", email: "hugo.bernard@demo.eventflow.local", role: "ADMIN" },
  { key: "director", name: "Sophie Moreau", email: "sophie.moreau@demo.eventflow.local", role: "DIRECTOR" },
  { key: "logistics", name: "Karim Haddad", email: "karim.haddad@demo.eventflow.local", role: "LOGISTICS_MANAGER" },
  { key: "stock", name: "Julie Petit", email: "julie.petit@demo.eventflow.local", role: "STOCK_MANAGER" },
  { key: "sales", name: "Thomas Roux", email: "thomas.roux@demo.eventflow.local", role: "SALES" },
  { key: "accounting", name: "Nadia Fontaine", email: "nadia.fontaine@demo.eventflow.local", role: "ACCOUNTING" },
  { key: "technician", name: "Lucas Garnier", email: "lucas.garnier@demo.eventflow.local", role: "TECHNICIAN" },
  { key: "driver", name: "Marc Lemoine", email: "marc.lemoine@demo.eventflow.local", role: "DRIVER" },
  { key: "crew", name: "Inès Caron", email: "ines.caron@demo.eventflow.local", role: "CREW" },
  { key: "readonly", name: "Paul Mercier", email: "paul.mercier@demo.eventflow.local", role: "READ_ONLY" },
];

const CATEGORIES: [string, string, string][] = [
  ["SON", "Sonorisation", "#6366f1"],
  ["LUM", "Éclairage", "#f59e0b"],
  ["VID", "Vidéo", "#0ea5e9"],
  ["STR", "Structure", "#64748b"],
  ["SCN", "Scène", "#a855f7"],
  ["MOB", "Mobilier", "#10b981"],
  ["DEC", "Décoration", "#ec4899"],
  ["ELEC", "Électricité", "#eab308"],
  ["DIST", "Distribution électrique", "#f97316"],
  ["CAB", "Câblage", "#78716c"],
  ["SIG", "Signalétique", "#14b8a6"],
  ["TENT", "Tentes", "#22c55e"],
  ["CHAUF", "Chauffage", "#ef4444"],
  ["CLIM", "Climatisation", "#38bdf8"],
  ["BAR", "Barrières", "#94a3b8"],
  ["ACC", "Accessoires", "#8b5cf6"],
  ["CONS", "Consommables", "#a3a3a3"],
];

// [sku, nom, catégorie, quantité, prix location, valeur remplacement, poids kg, rack, seuil]
const PRODUCTS: [string, string, string, number, string, string, string, string, number][] = [
  ["SON-ENC-12", "Enceinte active 12\" 1000 W", "SON", 16, "45.00", "890.00", "18.5", "A-01", 4],
  ["SON-SUB-18", "Caisson de basses 18\" 2000 W", "SON", 8, "75.00", "1450.00", "48", "A-01", 2],
  ["SON-CONS-32", "Console numérique 32 voies", "SON", 3, "180.00", "4200.00", "22", "A-02", 1],
  ["SON-MIC-HF", "Micro HF main (kit)", "SON", 20, "25.00", "520.00", "1.2", "A-02", 6],
  ["SON-MIC-SM58", "Micro filaire dynamique", "SON", 24, "8.00", "110.00", "0.4", "A-02", 6],
  ["SON-RET-10", "Retour de scène 10\"", "SON", 10, "30.00", "640.00", "14", "A-01", 2],
  ["LUM-PAR-LED", "Projecteur PAR LED RGBW", "LUM", 20, "18.00", "260.00", "3.2", "A-03", 6],
  ["LUM-LYRE-SPOT", "Lyre spot 200 W", "LUM", 12, "65.00", "1350.00", "16", "A-03", 4],
  ["LUM-LYRE-WASH", "Lyre wash LED", "LUM", 12, "55.00", "1100.00", "12", "A-03", 4],
  ["LUM-BARRE-LED", "Barre LED 1 m", "LUM", 24, "15.00", "190.00", "2.8", "A-04", 6],
  ["LUM-DMX-CTRL", "Contrôleur DMX 1024 canaux", "LUM", 3, "90.00", "1500.00", "6", "A-04", 1],
  ["LUM-HAZE", "Machine à brume", "LUM", 4, "60.00", "780.00", "11", "A-04", 1],
  ["VID-VP-10K", "Vidéoprojecteur 10 000 lm", "VID", 4, "250.00", "6800.00", "24", "A-05", 1],
  ["VID-ECR-3M", "Écran de projection 3 m", "VID", 6, "70.00", "650.00", "18", "A-05", 2],
  ["VID-LED-MUR", "Dalle LED 50×50 (mur d'images)", "VID", 48, "35.00", "900.00", "8", "A-06", 12],
  ["VID-TV-65", "Écran TV 65\" sur pied", "VID", 8, "95.00", "1200.00", "30", "A-06", 2],
  ["STR-TRUSS-3M", "Poutre alu triangulaire 3 m", "STR", 30, "22.00", "380.00", "12", "C-01", 8],
  ["STR-TRUSS-1M", "Poutre alu triangulaire 1 m", "STR", 20, "12.00", "190.00", "5", "C-01", 4],
  ["STR-PIED-LEV", "Pied de levage 5 m", "STR", 8, "45.00", "720.00", "38", "C-02", 2],
  ["STR-EMBASE", "Embase acier pour poutre", "STR", 16, "10.00", "140.00", "20", "C-02", 4],
  ["SCN-PRAT-2X1", "Praticable scène 2×1 m", "SCN", 40, "28.00", "420.00", "32", "C-03", 10],
  ["SCN-PIEDS-60", "Jeu de pieds praticable 60 cm", "SCN", 40, "4.00", "60.00", "6", "C-03", 10],
  ["SCN-ESCALIER", "Escalier de scène", "SCN", 4, "35.00", "500.00", "40", "C-04", 1],
  ["MOB-TABLE-RONDE", "Table ronde Ø 180 cm (10 pers.)", "MOB", 60, "12.00", "190.00", "28", "B-01", 15],
  ["MOB-TABLE-BRAS", "Table brasserie 220 cm", "MOB", 40, "8.00", "120.00", "18", "B-01", 10],
  ["MOB-CHAISE-NAP", "Chaise Napoléon III", "MOB", 400, "3.50", "45.00", "4", "B-02", 80],
  ["MOB-MANGE-DEB", "Mange-debout", "MOB", 40, "9.00", "110.00", "9", "B-02", 10],
  ["MOB-CHAISE-PLI", "Chaise pliante noire", "MOB", 300, "1.50", "22.00", "3.5", "B-03", 60],
  ["MOB-SALON-LOUNGE", "Salon lounge (canapé + 2 fauteuils)", "MOB", 6, "120.00", "1800.00", "70", "B-04", 2],
  ["MOB-COMPTOIR", "Comptoir d'accueil lumineux", "MOB", 5, "85.00", "950.00", "35", "B-04", 1],
  ["DEC-NAPPE-BL", "Nappe blanche ronde", "DEC", 120, "6.00", "35.00", "0.6", "B-03", 30],
  ["DEC-GUIRL-LED", "Guirlande guinguette 20 m", "DEC", 20, "25.00", "140.00", "3", "B-04", 4],
  ["DEC-ARCHE", "Arche florale", "DEC", 3, "90.00", "600.00", "15", "B-04", 1],
  ["ELEC-GROUPE-60", "Groupe électrogène 60 kVA", "ELEC", 2, "380.00", "18000.00", "1200", "C-04", 1],
  ["DIST-ARM-63", "Armoire de distribution 63 A", "DIST", 6, "60.00", "1300.00", "35", "C-04", 2],
  ["DIST-BOITIER-16", "Boîtier de distribution 16 A", "DIST", 20, "15.00", "260.00", "6", "C-04", 5],
  ["CAB-XLR-10", "Câble XLR 10 m", "CAB", 80, "2.00", "25.00", "0.5", "A-02", 20],
  ["CAB-HDMI-15", "Câble HDMI 15 m", "CAB", 20, "8.00", "60.00", "0.8", "A-05", 5],
  ["CAB-P17-25", "Rallonge P17 32 A 25 m", "CAB", 30, "12.00", "180.00", "12", "C-04", 6],
  ["SIG-TOTEM", "Totem signalétique", "SIG", 12, "25.00", "280.00", "14", "B-04", 3],
  ["SIG-POTELET", "Potelet à sangle", "SIG", 40, "5.00", "65.00", "7", "B-03", 10],
  ["TENT-PAGODE-5", "Tente pagode 5×5 m", "TENT", 6, "290.00", "4800.00", "260", "C-02", 1],
  ["TENT-PLIANTE-3", "Tente pliante 3×3 m", "TENT", 15, "70.00", "650.00", "40", "C-02", 3],
  ["CHAUF-PARASOL", "Chauffage parasol gaz", "CHAUF", 12, "45.00", "380.00", "22", "C-03", 3],
  ["CHAUF-SOUFFL", "Canon à air chaud 30 kW", "CHAUF", 4, "95.00", "1500.00", "28", "C-03", 1],
  ["CLIM-MOBILE", "Climatiseur mobile 3,5 kW", "CLIM", 6, "80.00", "900.00", "32", "C-03", 2],
  ["BAR-VAUBAN", "Barrière Vauban 2 m", "BAR", 100, "4.00", "70.00", "16", "C-01", 20],
  ["BAR-HERAS", "Clôture Heras 3,5 m", "BAR", 60, "6.00", "85.00", "20", "C-01", 10],
  ["ACC-PUPITRE", "Pupitre de conférence", "ACC", 4, "45.00", "520.00", "18", "B-04", 1],
  ["ACC-VESTIAIRE", "Portant vestiaire + 50 cintres", "ACC", 8, "25.00", "150.00", "12", "B-04", 2],
];
// Consommables non gérés en stock (facturables sans contrôle de disponibilité)
const CONSUMABLES: [string, string, string][] = [
  ["CONS-GAFFER", "Gaffer noir 50 mm (rouleau)", "9.00"],
  ["CONS-PILES", "Lot de piles AA (24)", "18.00"],
  ["CONS-GAZ", "Bouteille de gaz 13 kg", "38.00"],
];

async function main() {
  const password = guard();
  const existing = await db.organization.findUnique({ where: { slug: DEMO_SLUG }, select: { id: true } });
  if (existing) {
    if (process.env.SEED_RESET !== "true") {
      console.log("✔ Données de démonstration déjà présentes — rien à faire (SEED_RESET=true pour les recréer).");
      return;
    }
    console.log("↺ Suppression de l'organisation de démonstration existante…");
    await purgeOrganization(existing.id);
    const second = await db.organization.findUnique({ where: { slug: DEMO_SLUG_2 }, select: { id: true } });
    if (second) await purgeOrganization(second.id);
    await db.user.deleteMany({ where: { email: { endsWith: "@demo.eventflow.local" } } });
  }

  console.log("→ Organisation et comptes de démonstration");
  const org = await db.organization.create({
    data: {
      name: "Lumière & Cie Événements (démo)",
      slug: DEMO_SLUG,
      legalName: "Lumière & Cie Événements SAS (démonstration)",
      siret: "00000000000000",
      vatNumber: "FR00000000000",
      email: "contact@demo.eventflow.local",
      phone: "+33 1 00 00 00 00",
      addressLine1: "12 rue de la Démonstration",
      postalCode: "93200",
      city: "Saint-Denis",
      isDemo: true,
      prepBufferHours: 24,
      returnBufferHours: 24,
      quoteFooter: "Devis valable 30 jours. Acompte de 30 % à la commande. Données de démonstration.",
      invoiceFooter: "Données de démonstration — document sans valeur.",
      latePenaltyText: "Paiement à 30 jours. Pénalités de retard : 3 fois le taux d'intérêt légal ; indemnité forfaitaire pour frais de recouvrement : 40 €.",
    },
  });
  const org2 = await db.organization.create({ data: { name: "Agence Sud (démo)", slug: DEMO_SLUG_2, isDemo: true, city: "Marseille" } });

  const passwordHash = await hashPassword(password);
  const users: Record<string, { id: string }> = {};
  for (const u of USERS) {
    users[u.key] = await db.user.create({ data: { email: u.email, name: u.name, passwordHash } });
    await db.membership.create({ data: { organizationId: org.id, userId: users[u.key]!.id, role: u.role } });
  }
  // Le propriétaire est aussi membre d'une seconde organisation (démonstration du changement d'organisation)
  await db.membership.create({ data: { organizationId: org2.id, userId: users.owner!.id, role: "OWNER" } });
  await db.customer.create({ data: { organizationId: org2.id, kind: "COMPANY", name: "Client confidentiel Agence Sud" } });

  const ctx: AuthContext = await loadAuthContext(users.owner!.id, org.id);
  const logi: AuthContext = await loadAuthContext(users.logistics!.id, org.id);
  const sales: AuthContext = await loadAuthContext(users.sales!.id, org.id);
  const compta: AuthContext = await loadAuthContext(users.accounting!.id, org.id);

  console.log("→ Catégories, emplacements, catalogue");
  const categories: Record<string, string> = {};
  for (const [i, [code, name, color]] of CATEGORIES.entries()) {
    categories[code] = (await db.equipmentCategory.create({ data: { organizationId: org.id, code, name, color, sortOrder: i } })).id;
  }
  const warehouse = await db.stockLocation.create({ data: { organizationId: org.id, code: "ENT", name: "Entrepôt principal", kind: "WAREHOUSE" } });
  const zones = {
    A: await db.stockLocation.create({ data: { organizationId: org.id, code: "Z-A", name: "Zone A — Technique (son, lumière, vidéo)", kind: "ZONE", parentId: warehouse.id } }),
    B: await db.stockLocation.create({ data: { organizationId: org.id, code: "Z-B", name: "Zone B — Mobilier & décoration", kind: "ZONE", parentId: warehouse.id } }),
    C: await db.stockLocation.create({ data: { organizationId: org.id, code: "Z-C", name: "Zone C — Structures & énergie", kind: "ZONE", parentId: warehouse.id } }),
  };
  const racks: Record<string, string> = {};
  const rackDefs: [string, keyof typeof zones, number][] = [["A", "A", 6], ["B", "B", 4], ["C", "C", 4]];
  for (const [prefix, zone, count] of rackDefs) {
    for (let i = 1; i <= count; i++) {
      const code = `${prefix}-${String(i).padStart(2, "0")}`;
      racks[code] = (await db.stockLocation.create({ data: { organizationId: org.id, code, name: `Rayonnage ${code}`, kind: "RACK", parentId: zones[zone].id } })).id;
    }
  }
  const prep = await db.stockLocation.create({ data: { organizationId: org.id, code: "PREP", name: "Zone de préparation", kind: "PREPARATION", parentId: warehouse.id } });
  const ret = await db.stockLocation.create({ data: { organizationId: org.id, code: "RET", name: "Zone de retour", kind: "RETURN", parentId: warehouse.id } });
  await db.stockLocation.create({ data: { organizationId: org.id, code: "QUAR", name: "Quarantaine (endommagé)", kind: "QUARANTINE", parentId: warehouse.id } });
  await db.stockLocation.create({ data: { organizationId: org.id, code: "ATELIER", name: "Atelier maintenance", kind: "MAINTENANCE", parentId: warehouse.id } });
  await db.stockLocation.create({ data: { organizationId: org.id, code: "SORTIE", name: "Matériel sorti (transit / sur site)", kind: "OUT" } });
  void prep;

  const suppliers = {
    av: await db.supplier.create({ data: { organizationId: org.id, name: "AudioVision Pro (démo)", email: "commandes@audiovision.demo", city: "Lyon" } }),
    mob: await db.supplier.create({ data: { organizationId: org.id, name: "Mobilier Réception (démo)", email: "pro@mobilier.demo", city: "Lille" } }),
    struct: await db.supplier.create({ data: { organizationId: org.id, name: "Structures & Tentes (démo)", email: "ventes@structures.demo", city: "Nantes" } }),
  };
  await db.supplierContact.create({ data: { supplierId: suppliers.av.id, firstName: "Éric", lastName: "Vasseur", jobTitle: "Commercial", email: "eric@audiovision.demo" } });

  const products: Record<string, { id: string; rack: string }> = {};
  for (const [sku, name, cat, , rental, replacement, weight, rack, threshold] of PRODUCTS) {
    const supplierId = ["SON", "LUM", "VID"].includes(cat) ? suppliers.av.id : ["MOB", "DEC"].includes(cat) ? suppliers.mob.id : suppliers.struct.id;
    const p = await db.equipmentProduct.create({
      data: {
        organizationId: org.id,
        sku,
        name,
        categoryId: categories[cat]!,
        rentalPrice: rental,
        replacementValue: replacement,
        purchasePrice: (Number(replacement) * 0.8).toFixed(2),
        weightKg: weight,
        volumeM3: (Number(weight) / 150).toFixed(4),
        alertThreshold: threshold,
        supplierId,
        defaultLocationId: racks[rack]!,
      },
    });
    products[sku] = { id: p.id, rack: racks[rack]! };
  }
  for (const [sku, name, price] of CONSUMABLES) {
    await db.equipmentProduct.create({ data: { organizationId: org.id, sku, name, categoryId: categories.CONS!, rentalPrice: price, stockManaged: false, unit: "pièce" } });
  }
  // Unités sérialisées pour les équipements de valeur
  for (let i = 1; i <= 4; i++) {
    await db.equipmentAsset.create({ data: { organizationId: org.id, productId: products["VID-VP-10K"]!.id, serialNumber: `VP10K-DEMO-${String(i).padStart(3, "0")}`, locationId: racks["A-05"]! } });
  }
  await db.equipmentProduct.update({ where: { id: products["VID-VP-10K"]!.id }, data: { serialized: true } });

  console.log("→ Stock initial (réceptions tracées dans le journal)");
  for (const [sku, , , qty] of PRODUCTS) {
    await recordManualMovement(logi, { type: "RECEIPT", productId: products[sku]!.id, quantity: qty, toLocationId: products[sku]!.rack, reason: "Stock initial (démo)" });
  }

  console.log("→ Véhicules, compétences, équipe");
  const vehicles = {
    van1: await db.vehicle.create({ data: { organizationId: org.id, registration: "GA-125-EV", brand: "Renault", model: "Master L3H2", type: "VAN", payloadKg: 1300, volumeM3: "13", mileageKm: 48210, requiredLicense: "B", dailyCost: "95.00", costPerKm: "0.32", insuranceExpiresAt: new Date(Date.now() + 200 * DAY), inspectionDueAt: new Date(Date.now() + 120 * DAY) } }),
    van2: await db.vehicle.create({ data: { organizationId: org.id, registration: "GB-781-LC", brand: "Ford", model: "Transit Custom", type: "VAN", payloadKg: 1100, volumeM3: "8.3", mileageKm: 92840, requiredLicense: "B", dailyCost: "80.00", costPerKm: "0.28", insuranceExpiresAt: new Date(Date.now() + 12 * DAY), nextServiceKm: 93000 } }),
    truck1: await db.vehicle.create({ data: { organizationId: org.id, registration: "FZ-430-PL", brand: "Iveco", model: "Daily 35-160 caisse 20 m³", type: "TRUCK_LIGHT", payloadKg: 1100, volumeM3: "20", mileageKm: 131200, requiredLicense: "B", dailyCost: "130.00", costPerKm: "0.38", nextServiceAt: new Date(Date.now() + 5 * DAY) } }),
    truck2: await db.vehicle.create({ data: { organizationId: org.id, registration: "FX-902-HG", brand: "Renault Trucks", model: "D 12 t hayon", type: "TRUCK_HEAVY", payloadKg: 5500, volumeM3: "45", mileageKm: 210450, requiredLicense: "C", dailyCost: "260.00", costPerKm: "0.65" } }),
    trailer: await db.vehicle.create({ data: { organizationId: org.id, registration: "EK-556-RM", brand: "Humbaur", model: "Remorque plateau", type: "TRAILER", payloadKg: 2000, mileageKm: 0, status: "MAINTENANCE", notes: "Feux arrière à remplacer" } }),
  };
  await db.vehicleMaintenance.create({ data: { organizationId: org.id, vehicleId: vehicles.trailer.id, title: "Remplacement feux arrière", scheduledAt: at(-1, 9), blocksVehicle: true } });

  const skillNames = ["Sonorisation", "Éclairage", "Vidéo", "Habilitation électrique", "CACES chariot", "Permis C", "Régie générale", "Montage structure", "Accueil"];
  const skills: Record<string, string> = {};
  for (const name of skillNames) skills[name] = (await db.skill.create({ data: { organizationId: org.id, name } })).id;
  const staffDefs: [string, string, string, string, string, string, string[], string | null][] = [
    ["Lucas", "Garnier", "Technicien son", "EMPLOYEE", "32.00", "B", ["Sonorisation", "Régie générale"], "technician"],
    ["Marc", "Lemoine", "Chauffeur-livreur", "EMPLOYEE", "26.00", "B C", ["Permis C", "CACES chariot"], "driver"],
    ["Inès", "Caron", "Régisseuse", "INTERMITTENT", "38.00", "B", ["Régie générale", "Éclairage"], "crew"],
    ["Yanis", "Benali", "Technicien lumière", "INTERMITTENT", "34.00", "B", ["Éclairage", "Montage structure"], null],
    ["Chloé", "Dubois", "Technicienne vidéo", "FREELANCE", "40.00", "B", ["Vidéo"], null],
    ["Antoine", "Lefèvre", "Électricien", "EMPLOYEE", "35.00", "B", ["Habilitation électrique"], null],
    ["Sarah", "Nguyen", "Chargée d'accueil", "TEMP", "21.00", "", ["Accueil"], null],
    ["Mehdi", "Rahmani", "Monteur structure", "INTERMITTENT", "30.00", "B C", ["Montage structure", "CACES chariot", "Permis C"], null],
    ["Élodie", "Perrin", "Technicienne polyvalente", "EMPLOYEE", "29.00", "B", ["Sonorisation", "Éclairage"], null],
    ["Romain", "Fabre", "Magasinier", "EMPLOYEE", "24.00", "B", ["CACES chariot"], null],
  ];
  const staff: Record<string, string> = {};
  for (const [first, last, job, type, cost, licenses, sk, userKey] of staffDefs) {
    const s = await db.staffMember.create({
      data: {
        organizationId: org.id,
        firstName: first,
        lastName: last,
        jobTitle: job,
        employmentType: type as "EMPLOYEE",
        hourlyCost: cost,
        dailyCost: (Number(cost) * 8).toFixed(2),
        drivingLicenses: licenses || null,
        email: `${first.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}.${last.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}@demo.eventflow.local`,
        userId: userKey ? users[userKey]!.id : null,
        skills: { create: sk.map((n) => ({ skillId: skills[n]! })) },
      },
    });
    staff[`${first} ${last}`] = s.id;
  }
  await db.staffAvailability.create({ data: { organizationId: org.id, staffId: staff["Chloé Dubois"]!, startAt: at(1, 0), endAt: at(6, 0), reason: "Congés" } });

  console.log("→ Clients");
  const types: Record<string, string> = {};
  for (const [name, color] of [["Mariage", "#ec4899"], ["Séminaire", "#6366f1"], ["Salon", "#0ea5e9"], ["Concert", "#f97316"], ["Festival", "#22c55e"], ["Lancement produit", "#a855f7"], ["Événement sportif", "#eab308"], ["Gala associatif", "#14b8a6"], ["Conférence", "#64748b"]] as const) {
    types[name] = (await db.eventType.create({ data: { organizationId: org.id, name, color } })).id;
  }
  const customerDefs: { kind: "COMPANY" | "INDIVIDUAL"; name?: string; first?: string; last?: string; email: string; city: string; contact?: [string, string, string] }[] = [
    { kind: "COMPANY", name: "Nova Tech Industries (démo)", email: "evenements@novatech.demo", city: "Paris", contact: ["Claire", "Martin", "Responsable communication"] },
    { kind: "COMPANY", name: "Banque Horizon (démo)", email: "protocole@horizon.demo", city: "La Défense", contact: ["Olivier", "Blanc", "Directeur protocole"] },
    { kind: "COMPANY", name: "Festival des Lumières (démo)", email: "prod@festival.demo", city: "Lyon", contact: ["Manon", "Girard", "Directrice de production"] },
    { kind: "COMPANY", name: "Salon Maison & Design (démo)", email: "exposants@salonmd.demo", city: "Villepinte", contact: ["Bruno", "Lambert", "Chef de projet"] },
    { kind: "COMPANY", name: "Association Sportive du Val (démo)", email: "bureau@asval.demo", city: "Créteil", contact: ["Fatou", "Diallo", "Présidente"] },
    { kind: "COMPANY", name: "Mairie de Démoville (démo)", email: "culture@demoville.demo", city: "Démoville", contact: ["Jean", "Robert", "Service culture"] },
    { kind: "INDIVIDUAL", first: "Léa", last: "Fournier", email: "lea.fournier@particulier.demo", city: "Versailles" },
    { kind: "INDIVIDUAL", first: "Maxime", last: "Chevalier", email: "maxime.chevalier@particulier.demo", city: "Chantilly" },
    { kind: "COMPANY", name: "Studio Pulse Records (démo)", email: "booking@pulse.demo", city: "Montreuil", contact: ["Samir", "Haddou", "Booker"] },
    { kind: "COMPANY", name: "Groupe Santé Plus (démo)", email: "congres@santeplus.demo", city: "Paris", contact: ["Hélène", "Vidal", "Chargée de congrès"] },
  ];
  const customers: string[] = [];
  for (const c of customerDefs) {
    const created = await svcCreateCustomer(sales, { kind: c.kind, name: c.name ?? null, firstName: c.first ?? null, lastName: c.last ?? null, email: c.email, phone: "+33 1 00 00 00 00", siret: null, vatNumber: null, notes: "Client de démonstration" });
    await addAddress(sales, created.id, { kind: "BILLING", label: "Siège", line1: "1 avenue de l'Exemple", line2: null, postalCode: "75000", city: c.city, country: "FR", isDefault: true });
    if (c.contact) await addContact(sales, created.id, { firstName: c.contact[0], lastName: c.contact[1], jobTitle: c.contact[2], email: c.email, phone: null, isPrimary: true });
    customers.push(created.id);
  }

  console.log("→ Événements, devis, réservations et opérations");
  const mkEvent = async (o: { name: string; customer: number; type: string; start: Date; end: Date; venue: string; city: string; guests: number; budget: string; manager?: string }) =>
    createEvent(ctx, {
      name: o.name,
      customerId: customers[o.customer]!,
      eventTypeId: types[o.type]!,
      managerId: users[o.manager ?? "logistics"]!.id,
      timezone: TZ,
      startLocal: local(o.start),
      endLocal: local(o.end),
      setupStartLocal: local(new Date(o.start.getTime() - 6 * 3_600_000)),
      teardownEndLocal: local(new Date(o.end.getTime() + 4 * 3_600_000)),
      venueName: o.venue,
      addressLine1: "Adresse de démonstration",
      postalCode: "75000",
      city: o.city,
      country: "FR",
      guestCount: o.guests,
      budgetAmount: o.budget,
      estimatedCost: null,
      description: "Événement de démonstration",
    });

  const lineFor = (sku: string, qty: number, days = 1) => {
    const def = PRODUCTS.find((p) => p[0] === sku)!;
    return { kind: "EQUIPMENT" as const, productId: products[sku]!.id, description: def[1], quantity: String(qty), days: String(days), unitPrice: def[4], discountPercent: "0", vatRate: "20" };
  };
  const labor = (desc: string, hours: number, rate = "45.00") => ({ kind: "LABOR" as const, productId: null, description: desc, quantity: String(hours), days: "1", unitPrice: rate, discountPercent: "0", vatRate: "20" });
  const transport = (km: number) => ({ kind: "TRANSPORT" as const, productId: null, description: `Transport aller-retour (${km} km)`, quantity: "1", days: "1", unitPrice: (km * 1.4).toFixed(2), discountPercent: "0", vatRate: "20" });

  async function quoteFlow(eventId: string, customerIdx: number, title: string, lines: DocumentLineData[], accept: boolean, discount = "0") {
    const q = await createQuote(sales, { customerId: customers[customerIdx]!, eventId, title, validUntil: null, globalDiscountPercent: discount, notes: null, terms: "Acompte de 30 % à la signature, solde à réception de facture.", lines });
    await issueQuote(sales, q.id);
    if (accept) {
      const res = await acceptQuote(sales, q.id, { createReservation: true });
      return { quoteId: q.id, reservationId: res.reservationId };
    }
    return { quoteId: q.id, reservationId: null };
  }

  const reservationLines = async (reservationId: string) => db.reservationLine.findMany({ where: { reservationId }, select: { productId: true, quantity: true } });
  const prepareAll = async (reservationId: string, ratio = 1) => {
    const lines = await reservationLines(reservationId);
    const picks = [];
    for (const l of lines) {
      const qty = Math.floor(l.quantity * ratio);
      if (qty <= 0) continue;
      const bal = await db.stockBalance.findFirst({ where: { productId: l.productId, quantity: { gte: qty }, location: { kind: "RACK" } }, orderBy: { quantity: "desc" } });
      if (bal) picks.push({ productId: l.productId, fromLocationId: bal.locationId, quantity: qty });
    }
    if (picks.length) await prepareReservation(logi, reservationId, { lines: picks });
  };

  /**
   * DÉMO UNIQUEMENT : émission datée dans le passé pour illustrer échéances et retards de paiement.
   * (En production, l'émission se fait toujours à la date du jour via issueInvoice.)
   */
  const issueAt = async (invoiceId: string, issueDate: Date, termDays: number) => {
    await db.$transaction(async (tx) => {
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { customer: { select: { name: true, email: true } } } });
      const number = await nextDocumentNumber(tx, org.id, "invoice", "FAC", issueDate, 5);
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { number, status: "ISSUED", issueDate, issuedAt: issueDate, issuedById: compta.userId, dueDate: new Date(issueDate.getTime() + termDays * DAY), billingSnapshot: { customer: { name: inv.customer.name, email: inv.customer.email, siret: null, vatNumber: null, address: { line1: "1 avenue de l'Exemple", line2: null, postalCode: "75000", city: "Paris" } } } },
      });
    });
  };

  // E1 — séminaire terminé il y a 20 jours : retourné, facturé, payé
  const e1 = await mkEvent({ name: "Séminaire annuel Nova Tech", customer: 0, type: "Séminaire", start: at(-21, 9), end: at(-20, 18), venue: "Domaine des Chênes", city: "Rambouillet", guests: 180, budget: "18000.00", manager: "director" });
  const q1 = await quoteFlow(e1.id, 0, "Séminaire annuel — technique et mobilier", [lineFor("SON-ENC-12", 6, 2), lineFor("SON-MIC-HF", 8, 2), lineFor("VID-VP-10K", 2, 2), lineFor("VID-ECR-3M", 2, 2), lineFor("MOB-TABLE-RONDE", 18, 2), lineFor("MOB-CHAISE-NAP", 180, 2), labor("Technicien son & vidéo (2 jours)", 20), transport(110)], true, "5");
  await confirmReservation(logi, q1.reservationId!);
  await prepareAll(q1.reservationId!);
  await shipReservation(logi, q1.reservationId!, { allowIncomplete: false });
  const e1lines = await db.reservationLine.findMany({ where: { reservationId: q1.reservationId! } });
  await recordReturn(logi, q1.reservationId!, { lines: e1lines.map((l) => ({ productId: l.productId, quantityGood: l.quantityShipped, quantityDamaged: 0 })) });
  await changeEventStatus(ctx, e1.id, "COMPLETED", null);
  // Remise en rayon du matériel contrôlé (zone de retour → rayonnage d'origine)
  for (const b of await db.stockBalance.findMany({ where: { locationId: ret.id, quantity: { gt: 0 } }, select: { productId: true, quantity: true } })) {
    const target = Object.values(products).find((p) => p.id === b.productId)!.rack;
    await recordManualMovement(logi, { type: "TRANSFER", productId: b.productId, quantity: b.quantity, fromLocationId: ret.id, toLocationId: target, reason: "Remise en rayon après contrôle" });
  }
  const inv1 = await createInvoiceFromQuote(compta, q1.quoteId);
  await issueAt(inv1.id, at(-19, 10), 30);
  const inv1Data = await db.invoice.findUniqueOrThrow({ where: { id: inv1.id } });
  await recordPayment(compta, { invoiceId: inv1.id, amount: inv1Data.totalInclTax.toFixed(2), method: "BANK_TRANSFER", paidAt: at(-5, 10), reference: "VIR-DEMO-001", notes: null });
  await createExpense(compta, { category: "CATERING", description: "Repas équipe technique", amountExclTax: "320.00", vatRate: "10", incurredAt: at(-20, 13), eventId: e1.id, vehicleId: null, supplierId: null, supplierInvoiceRef: null });

  // E2 — concert il y a 8 jours : retour partiel, matériel endommagé, facture en retard partiellement payée
  const e2 = await mkEvent({ name: "Concert Pulse Night", customer: 8, type: "Concert", start: at(-9, 19), end: at(-8, 1), venue: "Le Hangar 9", city: "Montreuil", guests: 900, budget: "24000.00" });
  const q2 = await quoteFlow(e2.id, 8, "Concert — sonorisation et lumière", [lineFor("SON-ENC-12", 8), lineFor("SON-SUB-18", 4), lineFor("SON-CONS-32", 1), lineFor("SON-RET-10", 6), lineFor("LUM-LYRE-SPOT", 8), lineFor("LUM-LYRE-WASH", 8), lineFor("LUM-HAZE", 2), lineFor("STR-TRUSS-3M", 12), labor("Équipe technique (4 techniciens)", 40), transport(30)], true);
  await confirmReservation(logi, q2.reservationId!);
  await prepareAll(q2.reservationId!);
  await shipReservation(logi, q2.reservationId!, { allowIncomplete: false });
  const e2lines = await db.reservationLine.findMany({ where: { reservationId: q2.reservationId! }, include: { product: { select: { sku: true } } } });
  await recordReturn(logi, q2.reservationId!, {
    notes: "Retour partiel : 2 lyres encore chez le client",
    lines: e2lines.map((l) => {
      if (l.product.sku === "LUM-LYRE-SPOT") return { productId: l.productId, quantityGood: l.quantityShipped - 3, quantityDamaged: 1, anomaly: "Lyre spot : moteur pan bloqué après chute" };
      if (l.product.sku === "SON-ENC-12") return { productId: l.productId, quantityGood: l.quantityShipped - 1, quantityDamaged: 1, anomaly: "Membrane HP déchirée" };
      return { productId: l.productId, quantityGood: l.quantityShipped, quantityDamaged: 0 };
    }),
  });
  await changeEventStatus(ctx, e2.id, "COMPLETED", null);
  const inv2 = await createInvoiceFromQuote(compta, q2.quoteId);
  await issueAt(inv2.id, at(-8, 10), 5); // échéance dépassée → facture en retard
  await recordPayment(compta, { invoiceId: inv2.id, amount: "3000.00", method: "BANK_TRANSFER", paidAt: at(-7, 10), reference: "VIR-DEMO-002", notes: "Acompte" });
  await createExpense(compta, { category: "SUBCONTRACTING", description: "Renfort sécurité (prestataire)", amountExclTax: "850.00", vatRate: "20", incurredAt: at(-8, 22), eventId: e2.id, vehicleId: null, supplierId: null, supplierInvoiceRef: "SEC-2041" });

  // E3 — salon en cours : matériel expédié, véhicule en mission
  const e3 = await mkEvent({ name: "Salon Maison & Design — stand principal", customer: 3, type: "Salon", start: at(-1, 9), end: at(2, 19), venue: "Parc des expositions", city: "Villepinte", guests: 5000, budget: "32000.00", manager: "logistics" });
  const q3 = await quoteFlow(e3.id, 3, "Salon — stand 120 m²", [lineFor("VID-LED-MUR", 24, 4), lineFor("VID-TV-65", 4, 4), lineFor("MOB-COMPTOIR", 2, 4), lineFor("MOB-SALON-LOUNGE", 3, 4), lineFor("MOB-MANGE-DEB", 10, 4), lineFor("SIG-TOTEM", 6, 4), lineFor("LUM-BARRE-LED", 16, 4), labor("Montage / démontage stand", 32), transport(40)], true);
  await confirmReservation(logi, q3.reservationId!);
  await prepareAll(q3.reservationId!);
  await shipReservation(logi, q3.reservationId!, { allowIncomplete: false });
  await changeEventStatus(ctx, e3.id, "IN_PROGRESS", null);
  await createVehicleAssignment(logi, { vehicleId: vehicles.truck2.id, eventId: e3.id, driverId: staff["Marc Lemoine"]!, startAt: at(-2, 6), endAt: at(3, 12), purpose: "Livraison et reprise stand", loadWeightKg: "1450", loadVolumeM3: "22", distanceKm: 80 });
  await createStaffAssignment(logi, { eventId: e3.id, staffId: staff["Mehdi Rahmani"]!, role: "Chef monteur", requiredSkillId: skills["Montage structure"]!, startAt: at(-2, 7), endAt: at(-1, 19), propose: false });
  await createStaffAssignment(logi, { eventId: e3.id, staffId: staff["Chloé Dubois"]!, role: "Technicienne vidéo", requiredSkillId: skills["Vidéo"]!, startAt: at(-1, 8), endAt: at(0, 19), propose: false });
  const inv3 = await createInvoiceFromQuote(compta, q3.quoteId);
  await issueInvoice(compta, inv3.id);

  // E4 — mariage demain : préparé
  const e4 = await mkEvent({ name: "Mariage Fournier", customer: 6, type: "Mariage", start: at(1, 16), end: at(2, 4), venue: "Château de la Démo", city: "Chantilly", guests: 140, budget: "12500.00", manager: "sales" });
  const q4 = await quoteFlow(e4.id, 6, "Mariage — réception 140 invités", [lineFor("MOB-TABLE-RONDE", 14), lineFor("MOB-CHAISE-NAP", 140), lineFor("DEC-NAPPE-BL", 14), lineFor("DEC-GUIRL-LED", 6), lineFor("DEC-ARCHE", 1), lineFor("LUM-PAR-LED", 12), lineFor("SON-ENC-12", 4), lineFor("SON-MIC-HF", 2), lineFor("TENT-PAGODE-5", 2), lineFor("CHAUF-PARASOL", 6), labor("Installation et régie soirée", 16), transport(60)], true);
  await confirmReservation(logi, q4.reservationId!);
  await prepareAll(q4.reservationId!);
  await changeEventStatus(ctx, e4.id, "READY", null);
  await createVehicleAssignment(logi, { vehicleId: vehicles.truck1.id, eventId: e4.id, driverId: staff["Mehdi Rahmani"]!, startAt: at(1, 7), endAt: at(2, 14), purpose: "Livraison mobilier et tentes", loadWeightKg: "1050", loadVolumeM3: "18", distanceKm: 95 });
  await createVehicleAssignment(logi, { vehicleId: vehicles.van1.id, eventId: e4.id, driverId: staff["Élodie Perrin"]!, startAt: at(1, 8), endAt: at(2, 12), purpose: "Technique son et lumière", loadWeightKg: "320", loadVolumeM3: "4", distanceKm: 95 });
  await createStaffAssignment(logi, { eventId: e4.id, staffId: staff["Inès Caron"]!, role: "Régisseuse", requiredSkillId: skills["Régie générale"]!, startAt: at(1, 10), endAt: at(2, 4), propose: false });
  await createStaffAssignment(logi, { eventId: e4.id, staffId: staff["Lucas Garnier"]!, role: "Technicien son", requiredSkillId: skills["Sonorisation"]!, startAt: at(1, 12), endAt: at(2, 3), propose: false });
  await createStaffAssignment(logi, { eventId: e4.id, staffId: staff["Sarah Nguyen"]!, role: "Accueil invités", requiredSkillId: skills["Accueil"]!, startAt: at(1, 15), endAt: at(1, 23), propose: false });

  // E5 — lancement produit dans 3 jours : préparation en cours
  const e5 = await mkEvent({ name: "Lancement Nova X", customer: 0, type: "Lancement produit", start: at(3, 18), end: at(3, 23), venue: "Atelier Rivoli", city: "Paris", guests: 250, budget: "21000.00", manager: "director" });
  const q5 = await quoteFlow(e5.id, 0, "Lancement produit — scénographie", [lineFor("SCN-PRAT-2X1", 12), lineFor("SCN-PIEDS-60", 12), lineFor("SCN-ESCALIER", 1), lineFor("VID-VP-10K", 1), lineFor("VID-ECR-3M", 1), lineFor("LUM-LYRE-WASH", 8), lineFor("LUM-DMX-CTRL", 1), lineFor("SON-CONS-32", 1), lineFor("SON-ENC-12", 6), lineFor("ACC-PUPITRE", 1), labor("Équipe technique", 24), transport(15)], true, "8");
  await confirmReservation(logi, q5.reservationId!);
  await prepareAll(q5.reservationId!, 0.5);
  await createStaffAssignment(logi, { eventId: e5.id, staffId: staff["Yanis Benali"]!, role: "Technicien lumière", requiredSkillId: skills["Éclairage"]!, startAt: at(3, 10), endAt: at(4, 1), propose: false });
  await createVehicleAssignment(logi, { vehicleId: vehicles.van2.id, eventId: e5.id, driverId: staff["Romain Fabre"]!, startAt: at(3, 8), endAt: at(4, 9), purpose: "Scène et vidéo", loadWeightKg: "980", loadVolumeM3: "7", distanceKm: 30 });

  // E6 — festival dans 10 jours : confirmé
  const e6 = await mkEvent({ name: "Festival des Lumières — scène B", customer: 2, type: "Festival", start: at(10, 14), end: at(12, 23), venue: "Parc de la Tête d'Or", city: "Lyon", guests: 12000, budget: "68000.00", manager: "logistics" });
  const q6 = await quoteFlow(e6.id, 2, "Festival — scène B clé en main", [lineFor("SCN-PRAT-2X1", 20, 3), lineFor("SCN-PIEDS-60", 20, 3), lineFor("STR-TRUSS-3M", 14, 3), lineFor("STR-PIED-LEV", 4, 3), lineFor("SON-ENC-12", 6, 3), lineFor("SON-SUB-18", 4, 3), lineFor("LUM-LYRE-SPOT", 6, 3), lineFor("ELEC-GROUPE-60", 1, 3), lineFor("DIST-ARM-63", 2, 3), lineFor("BAR-VAUBAN", 60, 3), labor("Équipe scène B (6 personnes × 3 jours)", 180, "42.00"), transport(930)], true, "10");
  await confirmReservation(logi, q6.reservationId!);
  await changeEventStatus(ctx, e6.id, "CONFIRMED", null);

  // E7 — gala dans 20 jours : devis envoyé à relancer, réservation en attente (option)
  const e7 = await mkEvent({ name: "Gala de l'AS du Val", customer: 4, type: "Gala associatif", start: at(20, 19), end: at(21, 1), venue: "Salle des fêtes", city: "Créteil", guests: 300, budget: "9000.00", manager: "sales" });
  const q7 = await quoteFlow(e7.id, 4, "Gala — salle et technique", [lineFor("MOB-TABLE-RONDE", 30), lineFor("MOB-CHAISE-PLI", 300), lineFor("SON-ENC-12", 4), lineFor("LUM-PAR-LED", 16), labor("Technicien", 8)], false);
  await db.quote.update({ where: { id: q7.quoteId }, data: { followUpAt: at(-1, 9) } });
  const r7 = await createReservation(sales, { eventId: e7.id, lines: [{ productId: products["MOB-TABLE-RONDE"]!.id, quantity: 30 }, { productId: products["MOB-CHAISE-PLI"]!.id, quantity: 300 }], notes: "Option en attente de signature" });
  await submitReservation(sales, r7.id);

  // E8 — conférence dans 35 jours : brouillon de devis
  const e8 = await mkEvent({ name: "Congrès Santé Plus 2026", customer: 9, type: "Conférence", start: at(35, 8), end: at(36, 18), venue: "Palais des congrès", city: "Paris", guests: 600, budget: "45000.00", manager: "director" });
  await createQuote(sales, { customerId: customers[9]!, eventId: e8.id, title: "Congrès — plénière et ateliers", validUntil: null, globalDiscountPercent: "0", notes: "Brouillon en cours de chiffrage", terms: null, lines: [lineFor("VID-VP-10K", 2, 2), lineFor("VID-ECR-3M", 3, 2), lineFor("SON-MIC-HF", 10, 2), lineFor("ACC-PUPITRE", 2, 2)] });

  // E9 — événement sportif annulé (réservation annulée : ne bloque plus le stock)
  const e9 = await mkEvent({ name: "Course des Remparts", customer: 5, type: "Événement sportif", start: at(14, 8), end: at(14, 15), venue: "Centre-ville", city: "Démoville", guests: 1500, budget: "7000.00" });
  const r9 = await createReservation(logi, { eventId: e9.id, lines: [{ productId: products["BAR-VAUBAN"]!.id, quantity: 40 }, { productId: products["TENT-PLIANTE-3"]!.id, quantity: 6 }] });
  await confirmReservation(logi, r9.id);
  await cancelReservation(logi, r9.id, "Course reportée par la préfecture");
  await changeEventStatus(ctx, e9.id, "CANCELLED", "Report préfectoral");

  // E10 — devis refusé
  const e10 = await mkEvent({ name: "Soirée clients Banque Horizon", customer: 1, type: "Gala associatif", start: at(45, 19), end: at(46, 0), venue: "Hôtel particulier", city: "Paris", guests: 220, budget: "30000.00", manager: "sales" });
  const q10 = await quoteFlow(e10.id, 1, "Soirée clients — proposition A", [lineFor("MOB-SALON-LOUNGE", 6), lineFor("LUM-LYRE-WASH", 10), labor("Équipe soirée", 30)], false);
  await setQuoteStatus(sales, q10.quoteId, "DECLINED");

  console.log("→ Tâches, achats, pointages");
  await createTask(ctx, { title: "Valider le plan de feu du lancement", description: null, eventId: e5.id, assigneeId: staff["Yanis Benali"]!, priority: "HIGH", dueAt: at(-1, 18) });
  await createTask(ctx, { title: "Récupérer les 2 lyres restées au Hangar 9", description: "Contacter le client pour un créneau", eventId: e2.id, assigneeId: staff["Marc Lemoine"]!, priority: "URGENT", dueAt: at(0, 12) });
  await createTask(ctx, { title: "Confirmer l'horaire de livraison au château", description: null, eventId: e4.id, assigneeId: staff["Inès Caron"]!, priority: "NORMAL", dueAt: at(0, 17) });
  await createTask(ctx, { title: "Envoyer la fiche technique scène B", description: null, eventId: e6.id, assigneeId: null, priority: "NORMAL", dueAt: at(4, 12) });
  await createTask(ctx, { title: "Relancer le devis du gala", description: null, eventId: e7.id, assigneeId: null, priority: "HIGH", dueAt: at(-2, 10) });
  const e1Assign = await db.eventStaffAssignment.create({ data: { organizationId: org.id, eventId: e1.id, staffId: staff["Lucas Garnier"]!, role: "Technicien son & vidéo", startAt: at(-21, 7), endAt: at(-21, 19), hourlyCost: "32.00", status: "COMPLETED" } });
  await addTimesheet(logi, e1Assign.id, { workDate: at(-21, 12), hours: "11.50", notes: "Montage + exploitation" });

  const po1 = await createPurchaseOrder(logi, { supplierId: suppliers.av.id, expectedAt: at(7, 10), supplierInvoiceRef: null, notes: "Renouvellement parc micros", lines: [{ productId: products["SON-MIC-HF"]!.id, quantityOrdered: 6, unitCost: "410.00" }, { productId: products["CAB-XLR-10"]!.id, quantityOrdered: 40, unitCost: "18.50" }] });
  await placePurchaseOrder(logi, po1.id);
  const po2 = await createPurchaseOrder(logi, { supplierId: suppliers.mob.id, expectedAt: at(-10, 10), supplierInvoiceRef: "FM-88412", notes: null, lines: [{ productId: products["MOB-MANGE-DEB"]!.id, quantityOrdered: 10, unitCost: "85.00" }] });
  await placePurchaseOrder(logi, po2.id);
  const po2line = await db.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: po2.id } });
  await receivePurchaseOrder(logi, po2.id, { notes: "Livraison conforme", lines: [{ lineId: po2line.id, quantity: 10, locationId: racks["B-02"]! }] });

  await createExpense(compta, { category: "FUEL", description: "Carburant Iveco Daily", amountExclTax: "142.30", vatRate: "20", incurredAt: at(-3, 18), eventId: e3.id, vehicleId: vehicles.truck1.id, supplierId: null, supplierInvoiceRef: null });
  await createExpense(compta, { category: "INSURANCE", description: "Assurance flotte (mensualité)", amountExclTax: "690.00", vatRate: "0", incurredAt: at(-12, 9), eventId: null, vehicleId: null, supplierId: null, supplierInvoiceRef: null });

  console.log("→ Notifications (analyse des alertes)");
  const { created } = await runAlertScan(org.id);
  console.log(`  ${created} notification(s) générée(s)`);

  console.log("\n✔ Démo prête. Comptes (mot de passe : valeur de DEMO_PASSWORD) :");
  for (const u of USERS) console.log(`  ${u.role.padEnd(18)} ${u.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
