import "server-only";
import type { Prisma, SceneObjectType, SceneZone } from "@prisma/client";
import { addDays, startOfDayInZone, utcToZonedLocalInput } from "@/lib/dates";
import { db } from "@/lib/db";
import { locate } from "@/features/scene/geo";
import { orderLoading, productUnitVolume } from "@/lib/loading-plan";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { eventStatusLabels, locationKindLabels, vehicleOpsStatusLabels } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { CONTROL_SCREENS, DOCKS, gridPosition, OFFICE_FURNITURE, miniatureFor, miniatureScale, OFFICE_SCREENS, SPECIAL_AREA_OFFSETS, STAFF_DESK_SLOTS, TIMELINE, timelineX, zoneById } from "@/features/scene/layout";
import type { SceneBookmark, SceneData, SceneItem, SceneObjectKind } from "@/features/scene/types";
import { audit } from "../audit";
import { assertCan, can, type AuthContext } from "../auth/context";
import { getDashboard } from "./dashboard-service";
import { loadSitePlan, restoreSitePlan } from "./site-plan-service";
import { computeEventFinancials, monthlySeries } from "./finance-service";
import { stockSummaries } from "./inventory-service";
import { vehicleAlerts, vehicleOpsStatus } from "./vehicle-service";

const DAY_MS = 86_400_000;
/** Inventaire tournant : chaque emplacement doit être recompté au moins tous les 30 jours, 5 par jour. */
const COUNT_EVERY_DAYS = 30;
const COUNTS_PER_DAY = 5;
const COUNTABLE_KINDS = new Set(["RACK", "ZONE"]);

const PLACEABLE: Record<SceneObjectKind, SceneObjectType | null> = {
  STOCK_LOCATION: "STOCK_LOCATION",
  VEHICLE: "VEHICLE",
  DOCK: "DOCK",
  KPI_SCREEN: "KPI_SCREEN",
  CALENDAR_BOARD: "CALENDAR_BOARD",
  ALERT_BOARD: "ALERT_BOARD",
  EVENT: null,
  STAFF_DESK: null,
  MISSION_MAP: null,
  MEETING_TABLE: null,
  QUOTE_MAILBOX: null,
  INVOICE_SAFE: null,
};

/**
 * Construit la scène à partir des VRAIES données. Chaque objet porte son type et son identifiant
 * métier ; les objets que l'utilisateur n'a pas le droit de voir ne sont pas renvoyés.
 */
export async function getScene(ctx: AuthContext): Promise<SceneData> {
  assertCan(ctx, "dashboard:read");
  const org = ctx.organizationId;
  const now = new Date();
  const placements = await db.sceneObject.findMany({ where: { organizationId: org } });
  const placement = (type: SceneObjectType, businessId: string) => placements.find((p) => p.objectType === type && p.businessId === businessId);
  const items: SceneItem[] = [];

  const place = (type: SceneObjectType, businessId: string, fallback: [number, number, number]) => {
    const p = placement(type, businessId);
    return p
      ? { position: [p.positionX, p.positionY, p.positionZ] as [number, number, number], rotationY: p.rotationY, scale: p.scale, variant: p.variant, placed: true }
      : { position: fallback, rotationY: 0, scale: 1, variant: null, placed: false };
  };

  // ── Entrepôt : rayonnages / zones réels ──
  let locationCount = 0;
  if (can(ctx, "stock:read")) {
    const locations = await db.stockLocation.findMany({
      where: { organizationId: org, isActive: true, kind: { in: ["RACK", "ZONE", "PREPARATION", "RETURN", "QUARANTINE", "MAINTENANCE"] } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, kind: true, balances: { where: { quantity: { gt: 0 } }, select: { quantity: true, productId: true } } },
    });
    locationCount = locations.length;
    const lowStock = await db.equipmentProduct.findMany({ where: { organizationId: org, archivedAt: null, stockManaged: true, alertThreshold: { gt: 0 } }, select: { id: true, name: true, alertThreshold: true } });
    const summaries = await stockSummaries(org, lowStock.map((p) => p.id));
    const lowProducts = new Map(lowStock.filter((p) => summaries.get(p.id)!.availableNow <= p.alertThreshold).map((p) => [p.id, { name: p.name, available: summaries.get(p.id)!.availableNow, threshold: p.alertThreshold }]));
    const maxUnits = Math.max(1, ...locations.filter((l) => l.kind === "RACK").map((l) => l.balances.reduce((a, b) => a + b.quantity, 0)));
    const ids = locations.map((l) => l.id);
    const todayStart = startOfDayInZone(now, ctx.organization.timezone);
    const [outflows, counts] = await Promise.all([
      // Carte de chaleur : sorties (préparation, expédition, transfert) sur 90 jours
      db.stockMovement.groupBy({
        by: ["fromLocationId"],
        where: { organizationId: org, fromLocationId: { in: ids }, type: { in: ["PREPARATION", "SHIPMENT", "TRANSFER"] }, occurredAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } },
        _sum: { quantity: true },
      }),
      // Dernier comptage d'inventaire par emplacement (journal d'audit)
      db.auditLog.groupBy({ by: ["entityId"], where: { organizationId: org, action: "stock.count", entityType: "StockLocation", entityId: { in: ids } }, _max: { createdAt: true } }),
    ]);
    const outflowBy = new Map(outflows.map((o) => [o.fromLocationId!, o._sum.quantity ?? 0]));
    const maxOutflow = Math.max(1, ...outflowBy.values());
    const lastCountBy = new Map(counts.map((c) => [c.entityId!, c._max.createdAt]));
    const countable = locations.filter((l) => COUNTABLE_KINDS.has(l.kind));
    const doneToday = new Set(countable.filter((l) => (lastCountBy.get(l.id)?.getTime() ?? 0) >= todayStart.getTime()).map((l) => l.id));
    const due = countable
      .filter((l) => !doneToday.has(l.id))
      .filter((l) => {
        const last = lastCountBy.get(l.id);
        return !last || now.getTime() - last.getTime() > COUNT_EVERY_DAYS * DAY_MS;
      })
      .sort((a, b) => (lastCountBy.get(a.id)?.getTime() ?? 0) - (lastCountBy.get(b.id)?.getTime() ?? 0) || a.code.localeCompare(b.code));
    const todayList = new Set([...doneToday, ...due.slice(0, Math.max(0, COUNTS_PER_DAY - doneToday.size)).map((l) => l.id)]);
    let rackIndex = 0;
    for (const l of locations) {
      const units = l.balances.reduce((a, b) => a + b.quantity, 0);
      const special = SPECIAL_AREA_OFFSETS[l.kind];
      const wz = zoneById("WAREHOUSE").center;
      const fallback: [number, number, number] = special
        ? [wz[0] + special[0], 0, wz[1] + special[1]]
        : gridPosition("WAREHOUSE", rackIndex++, { cols: 6, spacingX: 6.5, spacingZ: 6 });
      const lowHere = [...new Set(l.balances.map((b) => b.productId))].flatMap((id) => (lowProducts.has(id) ? [lowProducts.get(id)!] : []));
      const hasLow = lowHere.length > 0;
      const status: SceneItem["status"] = l.kind === "QUARANTINE" || l.kind === "MAINTENANCE" ? (units > 0 ? "danger" : "idle") : hasLow ? "warning" : units === 0 ? "idle" : "ok";
      items.push({
        key: `STOCK_LOCATION:${l.id}`,
        kind: "STOCK_LOCATION",
        businessId: l.id,
        zone: "WAREHOUSE",
        label: l.code,
        sublabel: l.name,
        ...place("STOCK_LOCATION", l.id, fallback),
        variant: placement("STOCK_LOCATION", l.id)?.variant ?? (l.kind === "RACK" ? "rack" : `area-${l.kind.toLowerCase()}`),
        status,
        fill: l.kind === "RACK" ? Math.min(1, units / maxUnits) : undefined,
        outflow: outflowBy.get(l.id) ?? 0,
        heat: (outflowBy.get(l.id) ?? 0) / maxOutflow,
        count: COUNTABLE_KINDS.has(l.kind) ? { lastAt: lastCountBy.get(l.id)?.toISOString() ?? null, today: todayList.has(l.id), done: doneToday.has(l.id) } : undefined,
        alerts: lowHere.map((p) => ({ level: p.available === 0 ? "danger" : "warning", message: `${p.name} : ${p.available} dispo. / seuil ${p.threshold}` })),
        metrics: [
          { label: "Références", value: String(l.balances.length) },
          { label: "Unités", value: String(units) },
          { label: "Type", value: locationKindLabels[l.kind] },
        ],
        href: `/warehouse/locations/${l.id}`,
      });
    }
  }

  // ── Préparation en direct : réservations en cours de préparation (progression = lignes scannées) ──
  if (can(ctx, "reservations:read") && can(ctx, "stock:read")) {
    const prepItem = items.find((i) => i.kind === "STOCK_LOCATION" && i.variant === "area-preparation");
    if (prepItem) {
      const active = await db.reservation.findMany({
        where: { organizationId: org, status: { in: ["CONFIRMED", "IN_PREPARATION"] }, startAt: { lt: new Date(now.getTime() + 7 * DAY_MS) }, endAt: { gt: now } },
        orderBy: { startAt: "asc" },
        take: 3,
        select: { reference: true, status: true, event: { select: { reference: true } }, lines: { select: { productId: true, quantity: true, quantityPrepared: true } } },
      });
      const started = active.filter((r) => r.status === "IN_PREPARATION" || r.lines.some((l) => l.quantityPrepared > 0));
      const missing = [...new Set(started.flatMap((r) => r.lines.filter((l) => l.quantityPrepared < l.quantity).map((l) => l.productId)))];
      const visibleRacks = new Set(items.filter((i) => i.kind === "STOCK_LOCATION" && i.key !== prepItem.key).map((i) => i.businessId));
      const balances = missing.length
        ? await db.stockBalance.findMany({ where: { organizationId: org, productId: { in: missing }, quantity: { gt: 0 } }, orderBy: { quantity: "desc" }, select: { productId: true, locationId: true } })
        : [];
      prepItem.preparations = started.map((r) => {
        const total = r.lines.reduce((a, l) => a + l.quantity, 0);
        const prepared = r.lines.reduce((a, l) => a + Math.min(l.quantity, l.quantityPrepared), 0);
        const todo = new Set(r.lines.filter((l) => l.quantityPrepared < l.quantity).map((l) => l.productId));
        const sources = [...new Set(balances.filter((b) => todo.has(b.productId) && visibleRacks.has(b.locationId)).map((b) => `STOCK_LOCATION:${b.locationId}`))].slice(0, 6);
        return { reference: r.reference, event: r.event.reference, progress: total ? prepared / total : 0, remaining: total - prepared, sources };
      });
    }
  }

  // ── Logistique : quais + véhicules réels ──
  let vehicleCount = 0;
  if (can(ctx, "vehicles:read")) {
    const lz = zoneById("LOGISTICS");
    DOCKS.forEach((dock, i) => {
      items.push({
        key: `DOCK:${dock}`,
        kind: "DOCK",
        businessId: dock,
        zone: "LOGISTICS",
        label: `Quai ${i + 1}`,
        ...place("DOCK", dock, [lz.center[0] - lz.size[0] / 2 + 2, 0, lz.center[1] - 10 + i * 10]),
        status: "info",
        href: "/logistics",
      });
    });
    const vehicles = await db.vehicle.findMany({
      where: { organizationId: org, status: { not: "RETIRED" } },
      orderBy: { registration: "asc" },
      select: {
        id: true, registration: true, brand: true, model: true, type: true, status: true, payloadKg: true, mileageKm: true, volumeM3: true,
        insuranceExpiresAt: true, inspectionDueAt: true, nextServiceAt: true, nextServiceKm: true,
        assignments: { where: { status: { in: ["PLANNED", "CONFIRMED", "IN_PROGRESS"] }, endAt: { gt: now } }, orderBy: { startAt: "asc" }, select: { startAt: true, endAt: true, status: true, eventId: true, loadVolumeM3: true, event: { select: { reference: true } } } },
        maintenances: { where: { completedAt: null }, select: { scheduledAt: true, completedAt: true, blocksVehicle: true } },
      },
    });
    vehicleCount = vehicles.length;
    // Chargement : volume du matériel réservé pour l'événement de la mission en cours / suivante,
    // réparti entre les véhicules affectés au prorata de leur capacité (sauf volume saisi sur l'affectation)
    const missionEventIds = [...new Set(vehicles.flatMap((v) => (v.assignments[0] ? [v.assignments[0].eventId] : [])))];
    const eventLoad = new Map<string, { volume: number; missing: number }>();
    if (missionEventIds.length) {
      const lines = await db.reservationLine.findMany({
        where: { reservation: { organizationId: org, eventId: { in: missionEventIds }, status: { notIn: ["CANCELLED", "DRAFT", "RETURNED"] } } },
        select: { quantity: true, reservation: { select: { eventId: true } }, product: { select: { volumeM3: true, lengthCm: true, widthCm: true, heightCm: true } } },
      });
      for (const line of lines) {
        const entry = eventLoad.get(line.reservation.eventId) ?? { volume: 0, missing: 0 };
        const v = productUnitVolume(line.product);
        if (v === null) entry.missing += line.quantity;
        else entry.volume += v * line.quantity;
        eventLoad.set(line.reservation.eventId, entry);
      }
    }
    const capacityByEvent = new Map<string, number>();
    for (const v of vehicles) for (const a of v.assignments) if (v.volumeM3) capacityByEvent.set(a.eventId, (capacityByEvent.get(a.eventId) ?? 0) + Number(v.volumeM3));
    const loadOf = (v: (typeof vehicles)[number]): SceneItem["load"] => {
      const mission = v.assignments[0];
      const capacity = v.volumeM3 ? Number(v.volumeM3) : 0;
      if (!mission || !capacity) return undefined;
      const ev = eventLoad.get(mission.eventId) ?? { volume: 0, missing: 0 };
      const volume = mission.loadVolumeM3 !== null ? Number(mission.loadVolumeM3) : ev.volume * (capacity / (capacityByEvent.get(mission.eventId) ?? capacity));
      return { volume: Math.round(volume * 100) / 100, capacity, ratio: volume / capacity, event: mission.event.reference, missingVolumes: mission.loadVolumeM3 !== null ? 0 : ev.missing };
    };
    vehicles.forEach((v, i) => {
      const ops = vehicleOpsStatus(v, now);
      const alerts = vehicleAlerts(v, now);
      const statusMap = { AVAILABLE: "ok", ASSIGNED: "info", ON_MISSION: "info", MAINTENANCE: "warning", UNAVAILABLE: "danger" } as const;
      // Un véhicule en mission est représenté hors du quai (sur la route de sortie)
      const fallback: [number, number, number] = ops === "ON_MISSION" ? [lz.center[0] + 10, 0, lz.center[1] + 14 - (i % 3) * 4] : [lz.center[0] + 2 + (i % 2) * 7, 0, lz.center[1] - 12 + Math.floor(i / 2) * 8];
      items.push({
        key: `VEHICLE:${v.id}`,
        kind: "VEHICLE",
        businessId: v.id,
        zone: "LOGISTICS",
        label: v.registration,
        sublabel: `${v.brand} ${v.model}`,
        ...place("VEHICLE", v.id, fallback),
        variant: v.type === "VAN" || v.type === "CAR" ? "van" : "truck",
        rotationY: placement("VEHICLE", v.id)?.rotationY ?? -Math.PI / 2,
        status: alerts.some((a) => a.level === "danger") && ops === "AVAILABLE" ? "warning" : statusMap[ops],
        alerts,
        load: loadOf(v),
        metrics: [
          { label: "Statut", value: vehicleOpsStatusLabels[ops] },
          { label: "Prochaine mission", value: v.assignments[0]?.event.reference ?? "—" },
          { label: "Alertes", value: String(alerts.length) },
        ],
        href: `/vehicles/${v.id}`,
      });
    });
  }

  // ── Carte des missions : véhicules affectés, situés à la ville de leur événement ──
  if (can(ctx, "vehicles:read")) {
    const vehicleItems = new Map(items.filter((i) => i.kind === "VEHICLE").map((i) => [i.businessId, i]));
    const assignments = await db.vehicleAssignment.findMany({
      where: { organizationId: org, status: { in: ["PLANNED", "CONFIRMED", "IN_PROGRESS"] }, endAt: { gt: now }, startAt: { lt: new Date(now.getTime() + 7 * DAY_MS) } },
      orderBy: { startAt: "asc" },
      select: { vehicleId: true, startAt: true, endAt: true, vehicle: { select: { registration: true } }, event: { select: { reference: true, name: true, city: true, postalCode: true } } },
    });
    const orgRow = await db.organization.findUnique({ where: { id: org }, select: { name: true, city: true, postalCode: true } });
    const hqPos = orgRow ? locate(orgRow.city, orgRow.postalCode) : null;
    const seen = new Set<string>();
    let unlocated = 0;
    const missions: NonNullable<SceneItem["map"]>["missions"] = [];
    for (const a of assignments) {
      if (seen.has(a.vehicleId)) continue; // mission en cours ou la plus proche par véhicule
      seen.add(a.vehicleId);
      const pos = locate(a.event.city, a.event.postalCode);
      if (!pos) {
        unlocated++;
        continue;
      }
      missions.push({ vehicleKey: `VEHICLE:${a.vehicleId}`, vehicle: a.vehicle.registration, event: a.event.reference, eventName: a.event.name, city: a.event.city ?? "", lat: pos.lat, lon: pos.lon, precision: pos.precision, onMission: a.startAt <= now && vehicleItems.has(a.vehicleId) });
    }
    const lz = zoneById("LOGISTICS");
    items.push({
      key: "MISSION_MAP:logistics",
      kind: "MISSION_MAP",
      businessId: "logistics",
      zone: "LOGISTICS",
      label: "Carte des missions",
      sublabel: "Véhicules affectés sur 7 jours",
      position: [lz.center[0] - 7, 0, lz.center[1] - lz.size[1] / 2 + 1.2],
      rotationY: 0,
      scale: 1,
      placed: false,
      status: missions.some((m) => m.onMission) ? "info" : "idle",
      metrics: [
        { label: "En mission", value: String(missions.filter((m) => m.onMission).length) },
        { label: "Affectés (7 j)", value: String(missions.filter((m) => !m.onMission).length) },
        ...(unlocated ? [{ label: "Lieu inconnu", value: String(unlocated) }] : []),
      ],
      map: { hq: hqPos && orgRow ? { name: orgRow.city ?? orgRow.name, lat: hqPos.lat, lon: hqPos.lon } : null, missions, unlocated },
      href: "/vehicles",
    });
  }

  // ── Événements : pupitres par statut (identité = id de l'événement) ──
  let eventCount = 0;
  if (can(ctx, "events:read")) {
    const events = await db.event.findMany({
      where: { organizationId: org, status: { not: "CANCELLED" }, endAt: { gt: new Date(now.getTime() - 14 * 86_400_000) }, startAt: { lt: new Date(now.getTime() + 60 * 86_400_000) } },
      orderBy: { startAt: "asc" },
      take: 40,
      select: {
        id: true, reference: true, name: true, status: true, startAt: true, endAt: true, guestCount: true, eventType: { select: { name: true } },
        reservations: { where: { status: { not: "CANCELLED" } }, select: { status: true, startAt: true, endAt: true, lines: { select: { productId: true } } } },
        tasks: { where: { status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { lt: now } }, select: { id: true } },
        vehicleAssignments: { where: { status: { in: ["PLANNED", "CONFIRMED", "IN_PROGRESS"] } }, select: { vehicleId: true } },
      },
    });
    eventCount = events.length;
    // Liens : où se trouve le matériel encore en entrepôt (réservations non expédiées) + véhicules affectés
    const pendingProducts = (e: (typeof events)[number]) => e.reservations.filter((r) => ["DRAFT", "CONFIRMED", "IN_PREPARATION", "PREPARED"].includes(r.status)).flatMap((r) => r.lines.map((l) => l.productId));
    const allProducts = [...new Set(events.flatMap(pendingProducts))];
    const productLocations = new Map<string, string[]>();
    if (allProducts.length && can(ctx, "stock:read")) {
      const balances = await db.stockBalance.findMany({ where: { organizationId: org, productId: { in: allProducts }, quantity: { gt: 0 } }, select: { productId: true, locationId: true } });
      for (const b of balances) productLocations.set(b.productId, [...(productLocations.get(b.productId) ?? []), b.locationId]);
    }
    // Frise : chaque événement est posé à la date de son début, sur le premier couloir libre
    const laneEnds: number[] = TIMELINE.lanes.map(() => -Infinity);
    for (const e of events) {
      const lateReturn = e.reservations.some((r) => (r.status === "SHIPPED" || r.status === "PARTIALLY_RETURNED") && r.endAt < now);
      const lateTasks = e.tasks.length > 0;
      const column = e.status === "COMPLETED" ? "done" : e.startAt <= now && e.endAt > now ? "live" : e.status === "READY" || e.reservations.some((r) => r.status === "PREPARED" || r.status === "SHIPPED") ? "ready" : e.endAt <= now ? "done" : "prepare";
      const size = miniatureScale(e.guestCount);
      const x = timelineX(e.startAt, now);
      const span = Math.max(0, timelineX(e.endAt, now) - x);
      const half = 1.7 * size;
      const from = x - half;
      const to = Math.max(x + half, x + span) + 0.6;
      let lane = laneEnds.findIndex((end) => end <= from);
      if (lane === -1) lane = laneEnds.indexOf(Math.min(...laneEnds)); // frise saturée : couloir qui se libère le plus tôt
      laneEnds[lane] = Math.max(laneEnds[lane]!, to);
      const zPos = TIMELINE.lanes[lane]!;
      items.push({
        key: `EVENT:${e.id}`,
        kind: "EVENT",
        businessId: e.id,
        zone: "EVENTS",
        label: e.reference,
        sublabel: e.name,
        position: [x, 0, zPos],
        rotationY: 0,
        scale: 1,
        placed: false,
        variant: column,
        miniature: miniatureFor(e.eventType?.name),
        size,
        span,
        guests: e.guestCount,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt.toISOString(),
        links: [
          ...new Set([
            ...pendingProducts(e).flatMap((id) => (productLocations.get(id) ?? []).map((loc) => `STOCK_LOCATION:${loc}`)),
            ...e.vehicleAssignments.map((a) => `VEHICLE:${a.vehicleId}`),
          ]),
        ],
        status: lateReturn || lateTasks ? "danger" : column === "live" ? "info" : column === "ready" ? "ok" : column === "done" ? "idle" : "warning",
        metrics: [
          { label: "Statut", value: eventStatusLabels[e.status] },
          { label: "Tâches en retard", value: String(e.tasks.length) },
          { label: "Retour en retard", value: lateReturn ? "Oui" : "Non" },
        ],
        href: `/events/${e.id}`,
      });
    }
  }

  // ── Bureau & centre de contrôle : écrans reliés aux modules ──
  const dash = await getDashboard(ctx);
  const screenMetrics: Record<string, { label: string; value: string }[]> = {
    finance: dash.finance
      ? [
          { label: "CA prévu 90 j", value: formatMoney(dash.finance.revenueForecast) },
          { label: "Marge prévue", value: formatMoney(dash.finance.marginForecast) },
          { label: "Créances", value: formatMoney(dash.finance.receivables) },
        ]
      : [{ label: "Accès", value: "Restreint" }],
    calendar: [{ label: "Événements à venir", value: String(dash.upcomingEvents.length) }],
    alerts: [
      { label: "Stock bas", value: String(dash.stockAlerts?.lowStock.length ?? 0) },
      { label: "Unités immobilisées", value: String(dash.stockAlerts?.quarantineUnits ?? 0) },
      { label: "Retours en retard", value: String(dash.returns.filter((r) => r.late).length) },
    ],
    tasks: [{ label: "Tâches urgentes", value: String(dash.tasks.length) }],
    planning: [{ label: "Préparations", value: String(dash.preparations.length) }, { label: "Retours attendus", value: String(dash.returns.length) }],
    stock: [{ label: "Alertes stock", value: String(dash.stockAlerts?.lowStock.length ?? 0) }],
    vehicles: dash.vehicles ? [{ label: "En mission", value: String(dash.vehicles.onMission) }, { label: "Affectés", value: String(dash.vehicles.assigned) }] : [],
    staff: [],
    "late-tasks": [{ label: "En retard", value: String(dash.tasks.filter((t) => t.overdue).length) }],
    quotes: dash.quotes ? [{ label: "À relancer", value: String(dash.quotes.followUps) }, { label: "En attente", value: String(dash.quotes.pendingCount) }] : [],
    invoices: dash.invoices ? [{ label: "Impayées", value: String(dash.invoices.unpaidCount) }, { label: "En retard", value: formatMoney(dash.invoices.overdueAmount) }] : [],
    maintenance: [{ label: "Tickets ouverts", value: String(dash.stockAlerts?.openTickets ?? 0) }],
  };
  if (can(ctx, "staff:read")) {
    const active = await db.eventStaffAssignment.count({ where: { organizationId: org, status: { in: ["PLANNED", "CONFIRMED", "IN_PROGRESS"] }, startAt: { lt: new Date(now.getTime() + 7 * 86_400_000) }, endAt: { gt: now } } });
    screenMetrics.staff = [{ label: "Affectations 7 j", value: String(active) }];
  }
  const hrefs: Record<string, string> = {
    finance: "/finance", calendar: "/planning", alerts: "/inventory?lowStock=true", tasks: "/events/tasks", planning: "/planning", stock: "/inventory",
    vehicles: "/vehicles", staff: "/team", "late-tasks": "/events/tasks?overdue=true", quotes: "/quotes?followUp=true", invoices: "/invoices?overdue=true", maintenance: "/maintenance",
  };
  const level = (id: string): SceneItem["status"] => {
    if (id === "alerts" && ((dash.stockAlerts?.lowStock.length ?? 0) > 0 || dash.returns.some((r) => r.late))) return "warning";
    if (id === "invoices" && (dash.invoices?.overdueCount ?? 0) > 0) return "danger";
    if (id === "late-tasks" && dash.tasks.some((t) => t.overdue)) return "danger";
    if (id === "quotes" && (dash.quotes?.followUps ?? 0) > 0) return "warning";
    if (id === "maintenance" && (dash.stockAlerts?.openTickets ?? 0) > 0) return "warning";
    return "info";
  };
  // Tableau blanc : événements des 7 prochains jours (jours locaux de l'organisation)
  let week: SceneItem["week"];
  if (can(ctx, "events:read")) {
    const tz = ctx.organization.timezone;
    const start = startOfDayInZone(now, tz);
    const rows = await db.event.findMany({
      where: { organizationId: org, status: { not: "CANCELLED" }, startAt: { lt: addDays(start, 7) }, endAt: { gt: start } },
      orderBy: { startAt: "asc" },
      select: { id: true, reference: true, name: true, status: true, startAt: true, endAt: true },
    });
    const [y, m, d] = utcToZonedLocalInput(now, tz).slice(0, 10).split("-").map(Number) as [number, number, number];
    const label = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" });
    week = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(Date.UTC(y, m - 1, d + i));
      const day = date.toISOString().slice(0, 10);
      return {
        day,
        label: label.format(date),
        events: rows
          .filter((e) => utcToZonedLocalInput(e.startAt, tz).slice(0, 10) <= day && utcToZonedLocalInput(new Date(e.endAt.getTime() - 1), tz).slice(0, 10) >= day)
          .map((e) => ({ id: e.id, reference: e.reference, name: e.name, status: e.status })),
      };
    });
  }
  // Mini-graphiques des écrans (6 derniers mois)
  const monthName = (m: string) => new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" }).format(new Date(`${m}-15T00:00:00Z`)).replace(".", "");
  const months = can(ctx, "finance:read") ? (await monthlySeries(ctx, 6)) : null;
  const charts: Record<string, SceneItem["chart"]> = {
    ...(months
      ? {
          finance: { title: "Facturé HT", labels: months.map((m) => monthName(m.month)), values: months.map((m) => Number(m.invoiced)), kind: "bars", format: "money" },
          invoices: { title: "Encaissé", labels: months.map((m) => monthName(m.month)), values: months.map((m) => Number(m.collected)), kind: "line", format: "money" },
        }
      : {}),
    planning: { title: "Événements par mois", labels: dash.eventsSeries.map((m) => monthName(m.month)), values: dash.eventsSeries.map((m) => m.count), kind: "bars", format: "number" },
  };
  for (const s of OFFICE_SCREENS) {
    items.push({
      key: `${s.type}:office-${s.businessId}`,
      kind: s.type,
      businessId: `office-${s.businessId}`,
      zone: "OFFICE",
      label: s.label,
      ...place(s.type, `office-${s.businessId}`, [...s.position]),
      status: level(s.businessId),
      metrics: screenMetrics[s.businessId],
      chart: charts[s.businessId],
      href: hrefs[s.businessId] ?? "/dashboard",
      week: s.type === "CALENDAR_BOARD" ? week : undefined,
    });
  }
  CONTROL_SCREENS.forEach((s, i) => {
    const cz = zoneById("CONTROL");
    const angle = -Math.PI / 2 + (i / (CONTROL_SCREENS.length - 1)) * Math.PI;
    const fallback: [number, number, number] = [cz.center[0] + Math.cos(angle) * 9, 0, cz.center[1] + Math.sin(angle) * 9];
    items.push({
      key: `KPI_SCREEN:control-${s.businessId}`,
      kind: "KPI_SCREEN",
      businessId: `control-${s.businessId}`,
      zone: "CONTROL",
      label: s.label,
      ...place("KPI_SCREEN", `control-${s.businessId}`, fallback),
      rotationY: placement("KPI_SCREEN", `control-${s.businessId}`)?.rotationY ?? -angle - Math.PI / 2,
      status: level(s.businessId),
      metrics: screenMetrics[s.businessId] ?? [],
      chart: charts[s.businessId],
      href: hrefs[s.businessId] ?? "/dashboard",
    });
  });

  // ── Open space : un poste par collaborateur actif (nom, poste, en mission ou non) ──
  if (can(ctx, "staff:read")) {
    const staff = await db.staffMember.findMany({
      where: { organizationId: org, isActive: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true, firstName: true, lastName: true, jobTitle: true,
        assignments: { where: { status: { in: ["PLANNED", "CONFIRMED", "IN_PROGRESS"] }, startAt: { lte: now }, endAt: { gt: now } }, take: 1, select: { event: { select: { reference: true } } } },
        availabilities: { where: { startAt: { lte: now }, endAt: { gt: now } }, take: 1, select: { reason: true, endAt: true } },
      },
    });
    const hidden = Math.max(0, staff.length - STAFF_DESK_SLOTS.length);
    staff.slice(0, STAFF_DESK_SLOTS.length).forEach((m, i) => {
      const mission = m.assignments[0]?.event.reference;
      const leave = m.availabilities[0];
      const back = leave ? new Intl.DateTimeFormat("fr-FR", { timeZone: ctx.organization.timezone, day: "numeric", month: "short" }).format(leave.endAt) : null;
      const desk: SceneItem["desk"] = leave ? { state: "leave", detail: `${leave.reason ?? "Absent"} · retour le ${back}` } : mission ? { state: "mission", detail: mission } : { state: "available", detail: null };
      const last = i === STAFF_DESK_SLOTS.length - 1 && hidden > 0;
      items.push({
        key: `STAFF_DESK:${m.id}`,
        kind: "STAFF_DESK",
        businessId: m.id,
        zone: "OFFICE",
        label: `${m.firstName} ${m.lastName.charAt(0)}.`,
        sublabel: m.jobTitle ?? undefined,
        position: STAFF_DESK_SLOTS[i]!,
        rotationY: i < 5 ? Math.PI / 2 : Math.PI,
        scale: 1,
        placed: false,
        variant: last ? `+${hidden}` : null,
        status: leave ? "idle" : mission ? "info" : "ok",
        desk,
        metrics: [
          { label: "Poste", value: m.jobTitle ?? "—" },
          { label: "Situation", value: leave ? `Absent (${desk.detail})` : mission ? `En mission (${mission})` : "Au bureau / disponible" },
          ...(last ? [{ label: "Non représentés", value: `${hidden} collaborateur(s)` }] : []),
        ],
        href: `/team/${m.id}`,
      });
    });
  }

  // ── Mobilier interactif du bureau : table de réunion, courrier des devis, coffre des factures ──
  if (can(ctx, "events:read")) {
    items.push({
      key: "MEETING_TABLE:office",
      kind: "MEETING_TABLE",
      businessId: "office",
      zone: "OFFICE",
      label: "Salle de réunion",
      sublabel: "Réunion de préparation d'un événement",
      position: OFFICE_FURNITURE.meetingTable,
      rotationY: 0,
      scale: 1,
      placed: false,
      status: "info",
      metrics: [{ label: "Événements à venir (30 j)", value: String(dash.upcomingEvents.length) }],
      meeting: { events: dash.upcomingEvents.map((e) => ({ id: e.id, reference: e.reference, name: e.name, startAt: e.startAt })) },
      href: "/events",
    });
  }
  if (dash.quotes) {
    items.push({
      key: "QUOTE_MAILBOX:office",
      kind: "QUOTE_MAILBOX",
      businessId: "office",
      zone: "OFFICE",
      label: "Courrier des devis",
      sublabel: dash.quotes.followUps ? `${dash.quotes.followUps} devis à relancer` : "Aucune relance due",
      position: OFFICE_FURNITURE.mailbox,
      rotationY: 0,
      scale: 1,
      placed: false,
      status: dash.quotes.followUps ? "warning" : "ok",
      metrics: [
        { label: "À relancer", value: String(dash.quotes.followUps) },
        { label: "Devis envoyés", value: String(dash.quotes.pendingCount) },
        { label: "Montant en attente", value: formatMoney(dash.quotes.pendingAmount) },
      ],
      mailbox: {
        followUps: dash.quotes.followUps,
        pending: dash.quotes.pendingCount,
        pendingAmount: dash.quotes.pendingAmount,
        items: dash.quotes.items.map((q) => ({ id: q.id, number: q.number, customer: q.customer.name, amount: q.totalExclTax, followUp: q.needsFollowUp })),
      },
      href: "/quotes?followUp=true",
    });
  }
  if (dash.invoices) {
    const overdue = Number(dash.invoices.overdueAmount);
    items.push({
      key: "INVOICE_SAFE:office",
      kind: "INVOICE_SAFE",
      businessId: "office",
      zone: "OFFICE",
      label: "Créances",
      sublabel: dash.invoices.overdueCount ? `${dash.invoices.overdueCount} facture(s) en retard · ${formatMoney(dash.invoices.overdueAmount)}` : "Aucune facture en retard",
      position: OFFICE_FURNITURE.safe,
      rotationY: 0,
      scale: 1,
      placed: false,
      status: dash.invoices.overdueCount ? "danger" : "ok",
      metrics: [
        { label: "En retard", value: `${dash.invoices.overdueCount} · ${formatMoney(dash.invoices.overdueAmount)}` },
        { label: "Factures ouvertes", value: `${dash.invoices.unpaidCount} · ${formatMoney(dash.invoices.unpaidAmount)}` },
      ],
      safe: {
        overdueCount: dash.invoices.overdueCount,
        overdueAmount: overdue,
        unpaidCount: dash.invoices.unpaidCount,
        unpaidAmount: Number(dash.invoices.unpaidAmount),
        items: dash.invoices.items.map((i) => ({ id: i.id, number: i.number ?? "—", customer: i.customer, amount: i.balanceDue, dueDate: i.dueDate })),
      },
      href: "/invoices?overdue=true",
    });
  }

  // Ne garder que les liens vers des objets effectivement présents (et visibles par l'utilisateur)
  const keys = new Set(items.map((i) => i.key));
  for (const i of items) if (i.links) i.links = i.links.filter((k) => keys.has(k)).slice(0, 16);

  const movementsToday = can(ctx, "stock:read")
    ? await db.stockMovement.count({ where: { organizationId: org, occurredAt: { gte: startOfDayInZone(now, ctx.organization.timezone) } } })
    : 0;
  const site = await db.organization.findUnique({ where: { id: org }, select: { name: true, accentColor: true, timezone: true, city: true, postalCode: true } });
  const sitePos = site ? locate(site.city, site.postalCode) : null;
  const sitePlan = await loadSitePlan(org);

  return {
    generatedAt: now.toISOString(),
    items,
    counts: { locations: locationCount, vehicles: vehicleCount, events: eventCount },
    // Position par défaut : Paris (course du soleil plausible pour la France métropolitaine)
    site: { name: site?.name ?? ctx.organization.name, accentColor: site?.accentColor ?? "#6366f1", timezone: site?.timezone ?? ctx.organization.timezone, lat: sitePos?.lat ?? 48.857, lon: sitePos?.lon ?? 2.352, located: Boolean(sitePos) },
    activity: { movementsToday },
    sitePlan: sitePlan.plan,
    sitePlanRevision: sitePlan.revision,
  };
}

/**
 * Panneau contextuel : le serveur identifie le type et l'identifiant, vérifie les droits
 * et renvoie les données réelles.
 */
export async function getScenePanel(ctx: AuthContext, kind: string, id: string) {
  switch (kind) {
    case "STOCK_LOCATION": {
      assertCan(ctx, "stock:read");
      const l = await db.stockLocation.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: { id: true, code: true, name: true, kind: true, balances: { where: { quantity: { gt: 0 } }, orderBy: { product: { name: "asc" } }, select: { quantity: true, product: { select: { id: true, sku: true, name: true, category: { select: { name: true, color: true } } } } } } },
      });
      if (!l) throw new NotFoundError("Emplacement");
      return { kind, location: { id: l.id, code: l.code, name: l.name, kind: l.kind, kindLabel: locationKindLabels[l.kind] }, contents: l.balances.map((b) => ({ quantity: b.quantity, ...b.product })), href: `/warehouse/locations/${l.id}` };
    }
    case "PRODUCT": {
      assertCan(ctx, "inventory:read");
      const p = await db.equipmentProduct.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: { id: true, sku: true, name: true, unit: true, stockManaged: true, photoDocumentId: true, category: { select: { name: true, color: true } }, balances: { where: { quantity: { gt: 0 } }, select: { quantity: true, location: { select: { id: true, code: true, kind: true } } } } },
      });
      if (!p) throw new NotFoundError("Produit");
      const summary = p.stockManaged ? (await stockSummaries(ctx.organizationId, [p.id])).get(p.id)! : null;
      const movements = can(ctx, "stock:read")
        ? await db.stockMovement.findMany({ where: { productId: id, organizationId: ctx.organizationId }, orderBy: { occurredAt: "desc" }, take: 12, select: { id: true, type: true, quantity: true, occurredAt: true, reason: true, fromLocation: { select: { code: true } }, toLocation: { select: { code: true } }, user: { select: { name: true } } } })
        : [];
      return {
        kind,
        product: { ...p, photoUrl: p.photoDocumentId ? `/api/documents/${p.photoDocumentId}/download?inline=1` : null },
        summary,
        movements: movements.map((m) => ({ ...m, occurredAt: m.occurredAt.toISOString() })),
        actions: {
          transfer: can(ctx, "stock:write"),
          maintenance: can(ctx, "maintenance:write"),
        },
        href: `/inventory/${p.id}`,
      };
    }
    case "VEHICLE": {
      assertCan(ctx, "vehicles:read");
      const v = await db.vehicle.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: {
          id: true, registration: true, brand: true, model: true, type: true, status: true, payloadKg: true, volumeM3: true, mileageKm: true, requiredLicense: true,
          insuranceExpiresAt: true, inspectionDueAt: true, nextServiceAt: true, nextServiceKm: true,
          assignments: { where: { status: { in: ["PLANNED", "CONFIRMED", "IN_PROGRESS"] }, endAt: { gt: new Date() } }, orderBy: { startAt: "asc" }, take: 6, select: { id: true, startAt: true, endAt: true, status: true, event: { select: { id: true, reference: true, name: true } }, driver: { select: { firstName: true, lastName: true } } } },
          maintenances: { where: { completedAt: null }, select: { scheduledAt: true, completedAt: true, blocksVehicle: true, title: true } },
        },
      });
      if (!v) throw new NotFoundError("Véhicule");
      const ops = vehicleOpsStatus(v);
      // Plan de chargement de la prochaine mission (matériel de toutes les réservations de l'événement)
      const next = v.assignments[0];
      let loadingPlan = null;
      if (next && can(ctx, "reservations:read")) {
        const lines = await db.reservationLine.findMany({
          where: { reservation: { organizationId: ctx.organizationId, eventId: next.event.id, status: { notIn: ["CANCELLED", "DRAFT", "RETURNED"] } } },
          select: { quantity: true, product: { select: { sku: true, name: true, weightKg: true, volumeM3: true, lengthCm: true, widthCm: true, heightCm: true, category: { select: { name: true, color: true } } } } },
        });
        const byProduct = new Map<string, Parameters<typeof orderLoading>[0][number]>();
        for (const l of lines) {
          const prev = byProduct.get(l.product.sku);
          if (prev) prev.quantity += l.quantity;
          else byProduct.set(l.product.sku, { sku: l.product.sku, name: l.product.name, category: l.product.category.name, color: l.product.category.color, quantity: l.quantity, unitVolume: productUnitVolume(l.product), unitWeight: l.product.weightKg === null ? null : Number(l.product.weightKg) });
        }
        const vehicles = await db.vehicleAssignment.count({ where: { organizationId: ctx.organizationId, eventId: next.event.id, status: { in: ["PLANNED", "CONFIRMED", "IN_PROGRESS"] } } });
        loadingPlan = { event: next.event.reference, eventName: next.event.name, vehicles, capacity: v.volumeM3 ? Number(v.volumeM3) : null, steps: orderLoading([...byProduct.values()]) };
      }
      return {
        kind,
        vehicle: { id: v.id, registration: v.registration, brand: v.brand, model: v.model, type: v.type, status: v.status, payloadKg: v.payloadKg, volumeM3: v.volumeM3?.toString() ?? null, mileageKm: v.mileageKm, requiredLicense: v.requiredLicense },
        ops,
        opsLabel: vehicleOpsStatusLabels[ops],
        alerts: vehicleAlerts(v),
        missions: v.assignments.map((a) => ({ ...a, startAt: a.startAt.toISOString(), endAt: a.endAt.toISOString() })),
        maintenances: v.maintenances.map((m) => ({ title: m.title, scheduledAt: m.scheduledAt.toISOString() })),
        actions: { changeStatus: can(ctx, "vehicles:write") },
        loadingPlan,
        href: `/vehicles/${v.id}`,
      };
    }
    case "EVENT": {
      assertCan(ctx, "events:read");
      const e = await db.event.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: {
          id: true, reference: true, name: true, status: true, startAt: true, endAt: true, timezone: true, venueName: true, city: true,
          customer: { select: { name: true } },
          reservations: { select: { id: true, reference: true, status: true, endAt: true, lines: { select: { quantity: true, quantityPrepared: true, product: { select: { name: true } } } } } },
          staffAssignments: { where: { status: { notIn: ["CANCELLED", "DECLINED"] } }, select: { id: true, role: true, staff: { select: { firstName: true, lastName: true } } } },
          vehicleAssignments: { where: { status: { not: "CANCELLED" } }, select: { id: true, vehicle: { select: { registration: true } } } },
          tasks: { where: { status: { in: ["TODO", "IN_PROGRESS"] } }, orderBy: { dueAt: "asc" }, select: { id: true, title: true, dueAt: true, priority: true } },
        },
      });
      if (!e) throw new NotFoundError("Événement");
      const now = new Date();
      const alerts: string[] = [];
      for (const r of e.reservations) {
        if ((r.status === "SHIPPED" || r.status === "PARTIALLY_RETURNED") && r.endAt < now) alerts.push(`Retour en retard (${r.reference})`);
        const req = r.lines.reduce((a, l) => a + l.quantity, 0);
        const prep = r.lines.reduce((a, l) => a + l.quantityPrepared, 0);
        if ((r.status === "CONFIRMED" || r.status === "IN_PREPARATION") && e.startAt.getTime() - now.getTime() < 2 * 86_400_000 && prep < req) alerts.push(`Préparation incomplète (${r.reference} : ${prep}/${req})`);
      }
      for (const t of e.tasks) if (t.dueAt && t.dueAt < now) alerts.push(`Tâche en retard : ${t.title}`);
      // Dossier de réunion : budget, équipe, matériel, tâches
      const fin = can(ctx, "finance:read") ? (await computeEventFinancials(ctx.organizationId, [e.id])).get(e.id) : undefined;
      const active = e.reservations.filter((r) => r.status !== "CANCELLED");
      const equipment = new Map<string, { quantity: number; prepared: number }>();
      for (const r of active) for (const l of r.lines) {
        const cur = equipment.get(l.product.name) ?? { quantity: 0, prepared: 0 };
        equipment.set(l.product.name, { quantity: cur.quantity + l.quantity, prepared: cur.prepared + l.quantityPrepared });
      }
      const units = [...equipment.values()].reduce((a, v) => a + v.quantity, 0);
      const prepared = [...equipment.values()].reduce((a, v) => a + Math.min(v.quantity, v.prepared), 0);
      const briefing = {
        budget: fin ? { revenue: fin.revenueForecast, cost: fin.costForecast, margin: fin.marginForecast, marginRate: fin.marginRateForecast } : null,
        team: e.staffAssignments.map((a) => ({ name: `${a.staff.firstName} ${a.staff.lastName}`, role: a.role })),
        equipment: { lines: equipment.size, units, prepared, top: [...equipment].sort((a, b) => b[1].quantity - a[1].quantity).slice(0, 6).map(([name, v]) => ({ name, quantity: v.quantity })) },
        tasks: e.tasks.slice(0, 6).map((t) => ({ title: t.title, dueAt: t.dueAt?.toISOString() ?? null, late: Boolean(t.dueAt && t.dueAt < now), priority: t.priority })),
      };
      return {
        kind,
        event: { id: e.id, reference: e.reference, name: e.name, status: e.status, statusLabel: eventStatusLabels[e.status], startAt: e.startAt.toISOString(), endAt: e.endAt.toISOString(), timezone: e.timezone, venue: [e.venueName, e.city].filter(Boolean).join(", "), customer: e.customer.name },
        reservations: e.reservations.map((r) => ({ id: r.id, reference: r.reference, status: r.status })),
        staffCount: e.staffAssignments.length,
        vehicles: e.vehicleAssignments.map((v) => v.vehicle.registration),
        openTasks: e.tasks.length,
        alerts,
        briefing,
        actions: { changeStatus: can(ctx, "events:write") },
        href: `/events/${e.id}`,
      };
    }
    default:
      throw new ValidationError("Type d'objet inconnu");
  }
}

/** Enregistre la position d'un objet (édition de l'agencement) — identité métier vérifiée. */
export async function saveScenePlacement(
  ctx: AuthContext,
  input: { kind: SceneObjectKind; businessId: string; position: [number, number, number]; rotationY: number; scale: number; label: string },
) {
  assertCan(ctx, "scene:edit");
  const type = PLACEABLE[input.kind];
  if (!type) throw new ValidationError("Cet objet n'est pas positionnable");
  let zone: SceneZone;
  if (type === "STOCK_LOCATION") {
    const l = await db.stockLocation.findFirst({ where: { id: input.businessId, organizationId: ctx.organizationId }, select: { id: true } });
    if (!l) throw new NotFoundError("Emplacement");
    zone = "WAREHOUSE";
  } else if (type === "VEHICLE") {
    const v = await db.vehicle.findFirst({ where: { id: input.businessId, organizationId: ctx.organizationId }, select: { id: true } });
    if (!v) throw new NotFoundError("Véhicule");
    zone = "LOGISTICS";
  } else if (type === "DOCK") {
    if (!(DOCKS as readonly string[]).includes(input.businessId)) throw new NotFoundError("Quai");
    zone = "LOGISTICS";
  } else {
    const office = OFFICE_SCREENS.some((s) => `office-${s.businessId}` === input.businessId);
    const control = CONTROL_SCREENS.some((s) => `control-${s.businessId}` === input.businessId);
    if (!office && !control) throw new NotFoundError("Écran");
    zone = office ? "OFFICE" : "CONTROL";
  }
  const [x, y, z] = input.position;
  if (![x, y, z, input.rotationY, input.scale].every(Number.isFinite) || Math.abs(x) > 200 || Math.abs(z) > 200 || input.scale <= 0 || input.scale > 5) {
    throw new ValidationError("Position hors limites");
  }
  if (!can(ctx, type === "VEHICLE" ? "vehicles:read" : "dashboard:read")) throw new ForbiddenError();
  const saved = await db.sceneObject.upsert({
    where: { organizationId_objectType_businessId: { organizationId: ctx.organizationId, objectType: type, businessId: input.businessId } },
    create: { organizationId: ctx.organizationId, zone, objectType: type, businessId: input.businessId, label: input.label.slice(0, 100), positionX: x, positionY: y, positionZ: z, rotationY: input.rotationY, scale: input.scale },
    update: { positionX: x, positionY: y, positionZ: z, rotationY: input.rotationY, scale: input.scale },
    select: { id: true },
  });
  await audit(ctx, "scene.placement_saved", "SceneObject", saved.id, { type, businessId: input.businessId });
  return saved;
}

// ─── Versions de l'agencement (historique et retour arrière) ─────────────

type PlacementInput = Parameters<typeof saveScenePlacement>[1];

/** Instantané de l'agencement : placements des objets métier et plan du site courant. */
export async function snapshotLayout(ctx: AuthContext, label: string) {
  const rows = await db.sceneObject.findMany({
    where: { organizationId: ctx.organizationId },
    select: { zone: true, objectType: true, businessId: true, label: true, positionX: true, positionY: true, positionZ: true, rotationY: true, scale: true, variant: true },
  });
  const { plan } = await loadSitePlan(ctx.organizationId);
  return db.sceneLayoutVersion.create({
    data: { organizationId: ctx.organizationId, label: label.slice(0, 120), createdByName: ctx.user.name, objectCount: rows.length, snapshot: rows, sitePlan: plan as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
}

/**
 * Enregistre un lot de modifications d'agencement puis crée une version. La toute première fois,
 * l'état d'origine est d'abord sauvegardé pour pouvoir y revenir.
 */
export async function saveLayoutChanges(ctx: AuthContext, input: { label: string; changes: PlacementInput[] }) {
  assertCan(ctx, "scene:edit");
  if (input.changes.length === 0) throw new ValidationError("Aucune modification à enregistrer");
  if ((await db.sceneLayoutVersion.count({ where: { organizationId: ctx.organizationId } })) === 0) await snapshotLayout(ctx, "État initial");
  for (const change of input.changes) await saveScenePlacement(ctx, change);
  const version = await snapshotLayout(ctx, input.label);
  await audit(ctx, "scene.layout_saved", "SceneLayoutVersion", version.id, { changes: input.changes.length });
  return { versionId: version.id, saved: input.changes.length };
}

export async function listLayoutVersions(ctx: AuthContext) {
  assertCan(ctx, "scene:edit");
  const rows = await db.sceneLayoutVersion.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, label: true, createdByName: true, objectCount: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

type SnapshotRow = { zone: SceneZone; objectType: SceneObjectType; businessId: string; label: string; positionX: number; positionY: number; positionZ: number; rotationY: number; scale: number; variant: string | null };

/**
 * Revient à une version : remplace tous les placements de l'organisation par ceux de l'instantané,
 * ainsi que le plan du site s'il y figure (les versions antérieures au plan du site le laissent intact).
 */
export async function restoreLayoutVersion(ctx: AuthContext, id: string) {
  assertCan(ctx, "scene:edit");
  const version = await db.sceneLayoutVersion.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, label: true, createdAt: true, snapshot: true, sitePlan: true } });
  if (!version) throw new NotFoundError("Version d'agencement");
  const rows = (Array.isArray(version.snapshot) ? version.snapshot : []) as unknown as SnapshotRow[];
  await db.$transaction(async (tx) => {
    await tx.sceneObject.deleteMany({ where: { organizationId: ctx.organizationId } });
    await tx.sceneObject.createMany({
      data: rows.map((r) => ({ organizationId: ctx.organizationId, zone: r.zone, objectType: r.objectType, businessId: r.businessId, label: r.label, positionX: r.positionX, positionY: r.positionY, positionZ: r.positionZ, rotationY: r.rotationY, scale: r.scale, variant: r.variant })),
      skipDuplicates: true,
    });
    if (version.sitePlan !== null) await restoreSitePlan(tx, ctx.organizationId, version.sitePlan, ctx.user.name);
  });
  const date = new Intl.DateTimeFormat("fr-FR", { timeZone: ctx.organization.timezone, dateStyle: "short", timeStyle: "short" }).format(version.createdAt);
  const restored = await snapshotLayout(ctx, `Restauration de « ${version.label} » (${date})`);
  await audit(ctx, "scene.layout_restored", "SceneLayoutVersion", version.id, { newVersionId: restored.id });
  return { versionId: restored.id, objects: rows.length };
}

// ─── Présence en temps réel (points de vue des collègues connectés) ──────

const PRESENCE_TTL_MS = 15_000;
type Vec3 = [number, number, number];

/** Couleur stable dérivée de l'identifiant utilisateur. */
function presenceColor(userId: string) {
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 80% 62%)`;
}

/**
 * Enregistre le point de vue de l'utilisateur et renvoie celui des autres membres de l'organisation
 * actifs dans les 15 dernières secondes. `leave` supprime la présence (fermeture de la page).
 */
export async function updatePresence(ctx: AuthContext, input: { page: string; camera: { position: Vec3; target: Vec3; walking: boolean } | null; selectedKey: string | null; leave?: boolean }) {
  assertCan(ctx, "dashboard:read");
  const where = { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId } };
  if (input.leave || !input.camera) {
    await db.scenePresence.deleteMany({ where: { organizationId: ctx.organizationId, userId: ctx.userId } });
    return [];
  }
  const data = { name: ctx.user.name, page: input.page.slice(0, 40), camera: input.camera, selectedKey: input.selectedKey?.slice(0, 120) ?? null };
  await db.scenePresence.upsert({ where, create: { organizationId: ctx.organizationId, userId: ctx.userId, ...data }, update: data });
  const since = new Date(Date.now() - PRESENCE_TTL_MS);
  // Ménage des présences abandonnées (onglet fermé sans signal de départ)
  await db.scenePresence.deleteMany({ where: { organizationId: ctx.organizationId, updatedAt: { lt: new Date(Date.now() - 3_600_000) } } });
  const others = await db.scenePresence.findMany({
    where: { organizationId: ctx.organizationId, userId: { not: ctx.userId }, updatedAt: { gte: since } },
    orderBy: { name: "asc" },
    select: { userId: true, name: true, page: true, camera: true, selectedKey: true, updatedAt: true },
  });
  return others.map((o) => ({ userId: o.userId, name: o.name, color: presenceColor(o.userId), page: o.page, camera: o.camera as { position: Vec3; target: Vec3; walking: boolean }, selectedKey: o.selectedKey, updatedAt: o.updatedAt.toISOString() }));
}

// ─── Points de vue enregistrés (partagés avec l'organisation) ────────────

type Vec = [number, number, number];
const asVec = (v: unknown): Vec => (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number") ? (v as Vec) : [0, 0, 0]);

export async function listBookmarks(ctx: AuthContext): Promise<SceneBookmark[]> {
  assertCan(ctx, "dashboard:read");
  const rows = await db.sceneBookmark.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" }, take: 100 });
  return rows.map((b) => ({ id: b.id, name: b.name, position: asVec(b.position), target: asVec(b.target), createdByName: b.createdByName, canDelete: b.createdById === ctx.userId || can(ctx, "scene:edit") }));
}

export async function createBookmark(ctx: AuthContext, input: { name: string; position: Vec; target: Vec }) {
  assertCan(ctx, "dashboard:read");
  if (![...input.position, ...input.target].every((n) => Number.isFinite(n) && Math.abs(n) <= 500)) throw new ValidationError("Point de vue hors limites");
  const count = await db.sceneBookmark.count({ where: { organizationId: ctx.organizationId } });
  if (count >= 100) throw new ValidationError("100 points de vue au maximum : supprimez-en avant d'en ajouter");
  const b = await db.sceneBookmark.create({
    data: { organizationId: ctx.organizationId, name: input.name.slice(0, 60), position: input.position, target: input.target, createdById: ctx.userId, createdByName: ctx.user.name },
    select: { id: true },
  });
  await audit(ctx, "scene.bookmark_created", "SceneBookmark", b.id, { name: input.name });
  return b;
}

/** Suppression : par son auteur, ou par un utilisateur autorisé à modifier l'agencement. */
export async function deleteBookmark(ctx: AuthContext, id: string) {
  assertCan(ctx, "dashboard:read");
  const b = await db.sceneBookmark.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, createdById: true, name: true } });
  if (!b) throw new NotFoundError("Point de vue");
  if (b.createdById !== ctx.userId && !can(ctx, "scene:edit")) throw new ForbiddenError();
  await db.sceneBookmark.delete({ where: { id } });
  await audit(ctx, "scene.bookmark_deleted", "SceneBookmark", id, { name: b.name });
}
