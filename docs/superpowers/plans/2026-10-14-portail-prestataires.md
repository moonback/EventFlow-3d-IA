# Portail freelances & intermittents — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Les intermittents et freelances reçoivent une proposition de mission, l'acceptent ou la refusent en ligne via un lien à accès limité, et déclarent leurs disponibilités ; une affectation proposée n'est confirmée qu'après leur acceptation.

**Architecture :** On réutilise `EventStaffAssignment` (deux nouveaux statuts `PROPOSED` / `DECLINED`) et `StaffAvailability` (nouveau champ `kind` : `UNAVAILABLE` / `AVAILABLE`). Un nouveau modèle `StaffPortalToken` porte un jeton opaque (seul le hash SHA-256 est stocké, comme `Invitation`/`PasswordResetToken`) qui ne donne accès qu'aux données **d'un seul collaborateur dans une seule organisation**. Le portail est une page publique `/portal?token=…` sans session ; ses appels API passent par un `portalHandler` dédié (en-tête `X-Portal-Token`) qui construit un `PortalContext` minimal — jamais un `AuthContext`.

**Tech Stack :** Next.js (App Router) · Prisma 6 / PostgreSQL · Zod 4 · Vitest (intégration sur base réelle) · Playwright · nodemailer (`sendMail`).

**Spec :** demande utilisateur du 2026-10-14 (aucun document séparé) :
> « Portail freelance et intermittents 🟡 ⭐ — Les intermittents et freelances reçoivent une proposition de mission, l'acceptent ou la refusent en ligne et déclarent leurs disponibilités. L'affectation n'est confirmée qu'après acceptation. Où : jeton d'accès limité, réutilisant EventStaffAssignment et StaffAvailability. 🔗 Première brique concrète du portail prestataires. »

## Global Constraints

- Réutiliser `EventStaffAssignment` et `StaffAvailability` : pas de table « proposition » ni « disponibilité » parallèle.
- Jeton d'accès limité : 256 bits (`generateToken()`), stocké haché (`hashToken()`), expirant (30 jours), révocable, limité à un `staffId` + `organizationId`.
- Une affectation `PROPOSED` ne passe à `CONFIRMED` **que** par l'acceptation du prestataire ; le gestionnaire ne peut que l'annuler.
- Le portail n'expose jamais de coûts (`hourlyCost`, `dailyCost`), ni les données d'autres collaborateurs ou d'autres organisations.
- Toute action du portail est auditée (`audit()` avec `actorId = null`) et notifie les rôles logistique/direction.
- Code, messages et libellés en français ; conventions du dépôt (services dans `src/server/services`, schémas Zod dans `src/features/*/schemas.ts`, erreurs `AppError`).
- `npm run typecheck`, `npm run lint` et `npm test` doivent rester verts à la fin de chaque tâche.

## Review Focus

1. **Double clic / deux onglets sur « Accepter »** → une seule transition, la seconde renvoie `ASSIGNMENT_ALREADY_ANSWERED` (409) sans erreur 500. → test Task 5.
2. **Acceptation après qu'un autre engagement a pris le créneau** (mission confirmée entre-temps, conduite, indisponibilité saisie par le régisseur) → refus `SCHEDULE_CONFLICT`, l'affectation reste `PROPOSED`. → test Task 5.
3. **Jeton expiré, révoqué, collaborateur désactivé ou jeton d'une autre organisation** → 401 générique, aucune fuite de donnée. → tests Task 4.
4. **Proposition sur un événement annulé entre-temps** → acceptation refusée `EVENT_CANCELLED`. → test Task 5.
5. **Le gestionnaire tente de passer une proposition à `CONFIRMED` / `IN_PROGRESS`** → refus `AWAITING_RESPONSE` ; une affectation `DECLINED` ne peut pas être réactivée. → test Task 3.

---

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `prisma/schema.prisma` | enums `AssignmentStatus` (+`PROPOSED`, `DECLINED`), `StaffAvailabilityKind`, `NotificationType` (+`STAFF_MISSION_RESPONSE`) ; champs `respondedAt`, `declineReason`, `kind`, `declaredViaPortal` ; modèle `StaffPortalToken` |
| `prisma/migrations/2026101409xxxx_staff_portal/migration.sql` | générée par `prisma migrate dev` |
| `src/lib/labels.ts` | libellés des nouveaux statuts / types |
| `src/server/services/scheduling.ts` | `PROPOSED` bloque le créneau ; seules les `UNAVAILABLE` génèrent `STAFF_UNAVAILABLE` |
| `src/features/staff/schemas.ts` | `propose` sur `staffAssignmentSchema` |
| `src/server/services/staff-service.ts` | création en mode proposition, garde sur les statuts, planning |
| `src/server/audit.ts` | `userId` accepté à `null` (acteur externe) |
| `src/server/services/staff-portal-token-service.ts` | **nouveau** — émission / révocation / résolution des jetons |
| `src/server/services/staff-portal-service.ts` | **nouveau** — vue portail, réponse à une proposition, disponibilités |
| `src/features/staff-portal/schemas.ts` | **nouveau** — schémas Zod du portail |
| `src/server/api/handler.ts` | export de `assertSameOrigin` |
| `src/server/api/portal-handler.ts` | **nouveau** — enveloppe API du portail |
| `src/app/api/portal/**` | **nouveau** — routes du portail |
| `src/app/api/staff/[id]/portal-link/route.ts` | **nouveau** — émission / révocation par le gestionnaire |
| `src/middleware.ts` | `/portal` public |
| `src/app/portal/page.tsx` + `src/features/staff-portal/components/*` | **nouveau** — UI du portail |
| `src/features/events/components/event-dialogs.tsx`, `src/app/(workspace)/events/[id]/page.tsx`, `src/app/(workspace)/team/[id]/page.tsx`, `src/features/staff/components/staff-dialogs.tsx`, `src/app/(workspace)/planning/page.tsx` | UI gestionnaire |
| `tests/integration/staff-portal.test.ts` | **nouveau** |
| `tests/integration/scheduling.test.ts` | tests ajoutés |
| `tests/e2e/staff-portal.spec.ts` | **nouveau** — parcours complet |
| `docs/BUSINESS_RULES.md`, `docs/SECURITY.md`, `docs/DATABASE.md`, `ROADMAP.md` | documentation |

---

### Task 1 : Modèle de données et libellés

**Files :**
- Modify : `prisma/schema.prisma` (enum `AssignmentStatus` l.911, `NotificationType` l.239, modèles `Organization`, `StaffMember` l.972, `StaffAvailability` l.1025, `EventStaffAssignment` l.1039)
- Create : migration via Prisma
- Modify : `src/lib/labels.ts` (l.174 et l.285)

**Interfaces :**
- Produces : `AssignmentStatus.PROPOSED | DECLINED`, `StaffAvailabilityKind`, `NotificationType.STAFF_MISSION_RESPONSE`, modèle Prisma `staffPortalToken`, champs `EventStaffAssignment.respondedAt: Date | null`, `declineReason: string | null`, `StaffAvailability.kind`, `StaffAvailability.declaredViaPortal: boolean`.

- [ ] **Step 1 : Modifier le schéma**

```prisma
enum AssignmentStatus {
  /// Proposée à un prestataire, en attente de sa réponse (bloque le créneau)
  PROPOSED
  PLANNED
  CONFIRMED
  IN_PROGRESS
  COMPLETED
  /// Refusée par le prestataire
  DECLINED
  CANCELLED
}

enum StaffAvailabilityKind {
  UNAVAILABLE
  AVAILABLE
}
```

Dans `enum NotificationType`, ajouter avant `GENERAL` :

```prisma
  STAFF_MISSION_RESPONSE
```

`StaffAvailability` (ajouter deux champs après `reason`) :

```prisma
  /// UNAVAILABLE bloque les affectations ; AVAILABLE est une disponibilité déclarée (indicative)
  kind              StaffAvailabilityKind @default(UNAVAILABLE)
  /// Saisie par le prestataire lui-même via le portail (il ne peut supprimer que celles-ci)
  declaredViaPortal Boolean               @default(false)
```

`EventStaffAssignment` (après `hourlyCost`) :

```prisma
  /// Date de réponse du prestataire à une proposition
  respondedAt     DateTime?
  declineReason   String?
```

Nouveau modèle (après `Timesheet`) :

```prisma
/// Lien d'accès limité au portail prestataire : un collaborateur, une organisation. Seul le hash est stocké.
model StaffPortalToken {
  id             String       @id @default(cuid())
  organizationId String
  staffId        String
  tokenHash      String       @unique
  expiresAt      DateTime
  revokedAt      DateTime?
  lastUsedAt     DateTime?
  createdById    String?
  createdAt      DateTime     @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  staff          StaffMember  @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@index([staffId])
}
```

Relations inverses : dans `Organization` ajouter `staffPortalTokens StaffPortalToken[]` ; dans `StaffMember` ajouter `portalTokens StaffPortalToken[]`.

- [ ] **Step 2 : Générer la migration**

Run : `npm run db:migrate -- --name staff_portal`
Expected : nouveau dossier `prisma/migrations/*_staff_portal/` contenant `ALTER TYPE "AssignmentStatus" ADD VALUE 'PROPOSED'`, `CREATE TYPE "StaffAvailabilityKind"`, `CREATE TABLE "StaffPortalToken"`.

- [ ] **Step 3 : Lancer le typecheck pour voir les `Record` incomplets**

Run : `npm run typecheck`
Expected : FAIL dans `src/lib/labels.ts` (`assignmentStatusLabels`, `notificationTypeLabels` incomplets).

- [ ] **Step 4 : Compléter les libellés** (`src/lib/labels.ts`)

```ts
export const assignmentStatusLabels: Record<AssignmentStatus, string> = {
  PROPOSED: "Proposée",
  PLANNED: "Planifiée",
  CONFIRMED: "Confirmée",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  DECLINED: "Refusée",
  CANCELLED: "Annulée",
};
```

Dans `notificationTypeLabels`, avant `GENERAL` :

```ts
  STAFF_MISSION_RESPONSE: "Réponse à une proposition de mission",
```

Ajouter :

```ts
export const availabilityKindLabels: Record<StaffAvailabilityKind, string> = {
  UNAVAILABLE: "Indisponible",
  AVAILABLE: "Disponible",
};
```

(et `StaffAvailabilityKind` à l'import `@prisma/client` du fichier).

- [ ] **Step 5 : Vérifier**

Run : `npm run typecheck ; npm test`
Expected : PASS (aucun comportement modifié).

- [ ] **Step 6 : Commit**

```bash
git add prisma src/lib/labels.ts
git commit -m "feat(staff): modèle du portail prestataires (statuts proposée/refusée, disponibilités, jetons)"
```

---

### Task 2 : Règles de planification

**Files :**
- Modify : `src/server/services/scheduling.ts:16` et requête `staffAvailability` (l.~66)
- Modify : `src/server/services/staff-service.ts` (`staffSchedule`, `addUnavailability`, `getStaffMember`)
- Modify : `src/features/staff/schemas.ts` (`unavailabilitySchema`)
- Test : `tests/integration/scheduling.test.ts`

**Interfaces :**
- Produces : `ACTIVE = ["PROPOSED","PLANNED","CONFIRMED","IN_PROGRESS"]` ; `staffSchedule` renvoie des items `kind: "assignment" | "proposal" | "driving" | "unavailable" | "available"` ; `unavailabilitySchema` accepte `kind` (défaut `UNAVAILABLE`).

- [ ] **Step 1 : Écrire les tests (à la fin du `describe("personnel")`)**

```ts
  it("une proposition en attente bloque le créneau, une proposition refusée non", async () => {
    const proposed = await db.eventStaffAssignment.create({ data: { organizationId: ctx.organizationId, eventId: event1.id, staffId, role: "Son", status: "PROPOSED", startAt: day(27, 8), endAt: day(27, 18) } });
    const preview = await previewStaffAssignment(ctx, { eventId: event2.id, staffId, role: "Son", requiredSkillId: null, startAt: day(27, 10), endAt: day(27, 12), propose: false });
    expect(preview.conflicts.map((c) => c.kind)).toContain("STAFF_ASSIGNMENT");
    await db.eventStaffAssignment.update({ where: { id: proposed.id }, data: { status: "DECLINED" } });
    const after = await previewStaffAssignment(ctx, { eventId: event2.id, staffId, role: "Son", requiredSkillId: null, startAt: day(27, 10), endAt: day(27, 12), propose: false });
    expect(after.conflicts).toHaveLength(0);
  });

  it("une disponibilité déclarée (AVAILABLE) ne crée pas de conflit", async () => {
    await db.staffAvailability.create({ data: { organizationId: ctx.organizationId, staffId, kind: "AVAILABLE", startAt: day(28, 0), endAt: day(29, 0) } });
    const preview = await previewStaffAssignment(ctx, { eventId: event2.id, staffId, role: "Son", requiredSkillId: null, startAt: day(28, 9), endAt: day(28, 17), propose: false });
    expect(preview.conflicts).toHaveLength(0);
  });
```

Ajouter aussi `propose: false` à **tous** les appels existants de `createStaffAssignment` / `previewStaffAssignment` du fichier : `propose` est ajouté au schéma dans cette tâche (Step 3) et devient obligatoire dans le type de sortie Zod.

- [ ] **Step 2 : Lancer les tests**

Run : `npx vitest run tests/integration/scheduling.test.ts`
Expected : FAIL (`propose` inconnu, puis `STAFF_ASSIGNMENT` absent et conflit `STAFF_UNAVAILABLE` présent pour AVAILABLE).

- [ ] **Step 3 : Implémenter**

`src/features/staff/schemas.ts` :

```ts
export const unavailabilitySchema = z
  .object({ startAt: z.coerce.date(), endAt: z.coerce.date(), reason: optionalText(200), kind: z.enum(["UNAVAILABLE", "AVAILABLE"]).default("UNAVAILABLE") })
  .refine((v) => v.endAt > v.startAt, { message: "La fin doit être après le début", path: ["endAt"] });

export const staffAssignmentSchema = z
  .object({
    eventId: idSchema,
    staffId: idSchema,
    role: requiredText(100),
    requiredSkillId: optionalId,
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    /** true : mission proposée au prestataire, confirmée seulement après son acceptation */
    propose: z.boolean().default(false),
  })
  .refine((v) => v.endAt > v.startAt, { message: "La fin doit être après le début", path: ["endAt"] });
```

`src/server/services/scheduling.ts` :

```ts
const ACTIVE = ["PROPOSED", "PLANNED", "CONFIRMED", "IN_PROGRESS"] as const;
```

et la requête d'indisponibilités :

```ts
    tx.staffAvailability.findMany({ where: { organizationId, staffId, kind: "UNAVAILABLE", startAt: { lt: end }, endAt: { gt: start } }, select: { startAt: true, endAt: true, reason: true } }),
```

Mettre à jour le commentaire d'en-tête : « Les affectations annulées, refusées ou terminées ne bloquent pas. »

`src/server/services/staff-service.ts` — dans `createStaffAssignment`, provisoirement : `const { propose: _propose, ...fields } = data;` puis `create({ data: { organizationId: ctx.organizationId, ...fields, hourlyCost: staff.hourlyCost } })` (le mode proposition arrive Task 3).

`staffSchedule` :

```ts
      assignments: { where: { status: { notIn: ["CANCELLED", "DECLINED"] }, startAt: { lt: to }, endAt: { gt: from } }, select: { id: true, role: true, status: true, startAt: true, endAt: true, event: { select: { id: true, reference: true, name: true } } } },
      ...
      availabilities: { where: { startAt: { lt: to }, endAt: { gt: from } }, select: { id: true, kind: true, startAt: true, endAt: true, reason: true } },
```

```ts
    const items = [
      ...r.assignments.map((a) => ({ id: a.id, kind: a.status === "PROPOSED" ? ("proposal" as const) : ("assignment" as const), label: `${a.event.reference} · ${a.role}${a.status === "PROPOSED" ? " (proposée)" : ""}`, eventId: a.event.id, start: a.startAt, end: a.endAt })),
      ...r.vehicleAssignments.map(/* inchangé */),
      ...r.availabilities.map((u) => ({ id: u.id, kind: u.kind === "AVAILABLE" ? ("available" as const) : ("unavailable" as const), label: u.reason ?? (u.kind === "AVAILABLE" ? "Disponible" : "Indisponible"), eventId: null, start: u.startAt, end: u.endAt })),
    ].sort((a, b) => a.start.getTime() - b.start.getTime());
    // Conflits : deux éléments bloquants qui se chevauchent (une disponibilité déclarée n'est jamais en conflit)
    const blocking = items.filter((it) => it.kind !== "available");
```

et faire tourner la double boucle de détection sur `blocking` au lieu de `items`.

`getStaffMember` : ajouter `kind: true, declaredViaPortal: true` au `select` des `availabilities`.

`addUnavailability` : inchangé (le `kind` du schéma est passé via `...data`).

- [ ] **Step 4 : Relancer**

Run : `npx vitest run tests/integration/scheduling.test.ts ; npm run typecheck`
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/server/services/scheduling.ts src/server/services/staff-service.ts src/features/staff/schemas.ts tests/integration/scheduling.test.ts
git commit -m "feat(planning): propositions bloquantes et disponibilités déclarées non bloquantes"
```

---

### Task 3 : Proposition de mission côté gestionnaire

**Files :**
- Modify : `src/server/services/staff-service.ts` (`createStaffAssignment`, `setStaffAssignmentStatus`)
- Test : `tests/integration/staff-portal.test.ts` (création du fichier)

**Interfaces :**
- Consumes : `staffAssignmentSchema.propose` (Task 2).
- Produces : `createStaffAssignment(ctx, data)` crée en `PROPOSED` si `data.propose` ; `setStaffAssignmentStatus` lève `BusinessRuleError("AWAITING_RESPONSE")` / `("ASSIGNMENT_DECLINED")`.

- [ ] **Step 1 : Écrire les tests**

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { AuthContext } from "@/server/auth/context";
import { createStaffAssignment, setStaffAssignmentStatus } from "@/server/services/staff-service";
import { createEvent, createOrg, createUserInOrg, day } from "../helpers/factories";

let ctx: AuthContext;
let staffId: string;
let eventId: string;

beforeAll(async () => {
  const org = await createOrg("Portail");
  ctx = await createUserInOrg(org.id, "LOGISTICS_MANAGER");
  staffId = (await db.staffMember.create({ data: { organizationId: org.id, firstName: "Inès", lastName: "Roux", email: "ines@test.local", employmentType: "INTERMITTENT", hourlyCost: "30.00" } })).id;
  eventId = (await createEvent(org.id, day(3, 8), day(3, 23))).id;
});

const mission = (n: number, propose = true) => ({ eventId, staffId, role: "Régie son", requiredSkillId: null, startAt: day(n, 8), endAt: day(n, 18), propose });

describe("proposition de mission (gestionnaire)", () => {
  it("crée l'affectation en statut PROPOSED", async () => {
    const a = await createStaffAssignment(ctx, mission(3));
    const row = await db.eventStaffAssignment.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe("PROPOSED");
  });

  it("sans propose, l'affectation reste PLANNED (comportement historique)", async () => {
    const a = await createStaffAssignment(ctx, mission(4, false));
    expect((await db.eventStaffAssignment.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("PLANNED");
  });

  it("le gestionnaire ne peut pas confirmer une proposition, seulement l'annuler", async () => {
    const a = await createStaffAssignment(ctx, mission(5));
    await expect(setStaffAssignmentStatus(ctx, a.id, "CONFIRMED")).rejects.toMatchObject({ code: "AWAITING_RESPONSE" });
    await expect(setStaffAssignmentStatus(ctx, a.id, "IN_PROGRESS")).rejects.toMatchObject({ code: "AWAITING_RESPONSE" });
    await expect(setStaffAssignmentStatus(ctx, a.id, "CANCELLED")).resolves.toMatchObject({ status: "CANCELLED" });
  });

  it("une affectation refusée ne peut pas être réactivée", async () => {
    const a = await createStaffAssignment(ctx, mission(6));
    await db.eventStaffAssignment.update({ where: { id: a.id }, data: { status: "DECLINED" } });
    await expect(setStaffAssignmentStatus(ctx, a.id, "PLANNED")).rejects.toMatchObject({ code: "ASSIGNMENT_DECLINED" });
  });
});
```

- [ ] **Step 2 : Lancer**

Run : `npx vitest run tests/integration/staff-portal.test.ts`
Expected : FAIL (statut `PLANNED` au lieu de `PROPOSED`, pas de garde).

- [ ] **Step 3 : Implémenter** (`staff-service.ts`)

Dans `createStaffAssignment`, remplacer la création :

```ts
    const { propose, ...fields } = data;
    const a = await tx.eventStaffAssignment.create({
      data: { organizationId: ctx.organizationId, ...fields, status: propose ? "PROPOSED" : "PLANNED", hourlyCost: staff.hourlyCost },
      select: { id: true },
    });
    await audit(ctx, propose ? "staff.mission_proposed" : "staff.assigned", "EventStaffAssignment", a.id, { staffId: data.staffId, eventId: data.eventId, role: data.role }, tx);
    return a;
```

Dans `setStaffAssignmentStatus`, après le contrôle `CANCELLED` :

```ts
  if (a.status === "DECLINED") throw new BusinessRuleError("ASSIGNMENT_DECLINED", "Mission refusée par le prestataire : créez une nouvelle proposition");
  if (a.status === "PROPOSED" && status !== "CANCELLED") throw new BusinessRuleError("AWAITING_RESPONSE", "Mission en attente de la réponse du prestataire : seule l'annulation est possible");
```

Dans `addTimesheet`, refuser aussi les statuts `PROPOSED` et `DECLINED` :

```ts
  if (a.status === "PROPOSED" || a.status === "DECLINED") throw new BusinessRuleError("ASSIGNMENT_NOT_CONFIRMED", "Mission non acceptée par le prestataire");
```

- [ ] **Step 4 : Relancer**

Run : `npx vitest run tests/integration/staff-portal.test.ts tests/integration/scheduling.test.ts`
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/server/services/staff-service.ts tests/integration/staff-portal.test.ts
git commit -m "feat(staff): proposition de mission confirmée uniquement par le prestataire"
```

---

### Task 4 : Jetons d'accès limité au portail

**Files :**
- Modify : `src/server/audit.ts` (type du premier paramètre)
- Create : `src/server/services/staff-portal-token-service.ts`
- Test : `tests/integration/staff-portal.test.ts`

**Interfaces :**
- Produces :
  - `interface PortalContext { tokenId: string; organizationId: string; staffId: string; staffName: string; organization: { name: string; timezone: string } }`
  - `issuePortalToken(ctx: AuthContext, staffId: string, opts?: { sendEmail?: boolean }): Promise<{ link: string; expiresAt: string; mail: MailResult | null }>`
  - `revokePortalTokens(ctx: AuthContext, staffId: string): Promise<{ revoked: number }>`
  - `resolvePortalToken(token: string, now?: Date): Promise<PortalContext>` — lève `UnauthorizedError` (message générique) sinon.
  - `PORTAL_TOKEN_TTL_MS = 30 * 86_400_000`

- [ ] **Step 1 : Écrire les tests** (ajouter au fichier, avec les imports correspondants)

```ts
import { issuePortalToken, resolvePortalToken, revokePortalTokens } from "@/server/services/staff-portal-token-service";

const tokenOf = (link: string) => new URL(link).searchParams.get("token")!;

describe("jetons du portail", () => {
  it("émet un lien dont seul le hash est stocké, et le résout vers le bon collaborateur", async () => {
    const { link } = await issuePortalToken(ctx, staffId, { sendEmail: false });
    const token = tokenOf(link);
    expect(await db.staffPortalToken.count({ where: { tokenHash: token } })).toBe(0);
    const p = await resolvePortalToken(token);
    expect(p).toMatchObject({ staffId, organizationId: ctx.organizationId });
  });

  it("refuse un jeton inconnu, expiré ou révoqué", async () => {
    await expect(resolvePortalToken("inconnu")).rejects.toMatchObject({ status: 401 });
    const { link } = await issuePortalToken(ctx, staffId, { sendEmail: false });
    await expect(resolvePortalToken(tokenOf(link), new Date(Date.now() + 31 * 86_400_000))).rejects.toMatchObject({ status: 401 });
    expect((await revokePortalTokens(ctx, staffId)).revoked).toBeGreaterThan(0);
    await expect(resolvePortalToken(tokenOf(link))).rejects.toMatchObject({ status: 401 });
  });

  it("refuse le jeton d'un collaborateur désactivé", async () => {
    const other = await db.staffMember.create({ data: { organizationId: ctx.organizationId, firstName: "Old", lastName: "Timer", employmentType: "FREELANCE" } });
    const { link } = await issuePortalToken(ctx, other.id, { sendEmail: false });
    await db.staffMember.update({ where: { id: other.id }, data: { isActive: false } });
    await expect(resolvePortalToken(tokenOf(link))).rejects.toMatchObject({ status: 401 });
  });

  it("n'émet pas de lien pour un collaborateur d'une autre organisation", async () => {
    const org2 = await createOrg("Autre");
    const foreign = await db.staffMember.create({ data: { organizationId: org2.id, firstName: "X", lastName: "Y" } });
    await expect(issuePortalToken(ctx, foreign.id, { sendEmail: false })).rejects.toMatchObject({ status: 404 });
  });

  it("un rôle sans staff:assign ne peut pas émettre de lien", async () => {
    const crew = await createUserInOrg(ctx.organizationId, "CREW");
    await expect(issuePortalToken(crew, staffId, { sendEmail: false })).rejects.toMatchObject({ status: 403 });
  });
});
```

- [ ] **Step 2 : Lancer**

Run : `npx vitest run tests/integration/staff-portal.test.ts`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : Élargir `audit()`** (`src/server/audit.ts`)

```ts
export async function audit(
  ctx: { organizationId: string; userId: string | null; ipAddress?: string | null },
```

(le reste inchangé ; `actorId: ctx.userId` accepte `null`).

- [ ] **Step 4 : Implémenter** `src/server/services/staff-portal-token-service.ts`

```ts
import "server-only";
import { env } from "@/lib/env";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import { db } from "@/lib/db";
import { audit } from "../audit";
import { assertCan, type AuthContext } from "../auth/context";
import { generateToken, hashToken } from "../auth/tokens";
import { sendMail, type MailResult } from "../mail";

export const PORTAL_TOKEN_TTL_MS = 30 * 86_400_000;

/** Contexte d'une requête du portail : un seul collaborateur, une seule organisation, aucun droit applicatif. */
export interface PortalContext {
  tokenId: string;
  organizationId: string;
  staffId: string;
  staffName: string;
  organization: { name: string; timezone: string };
}

/** Émet un lien d'accès au portail (les liens précédents restent valides jusqu'à révocation ou expiration). */
export async function issuePortalToken(ctx: AuthContext, staffId: string, opts: { sendEmail?: boolean } = {}): Promise<{ link: string; expiresAt: string; mail: MailResult | null }> {
  assertCan(ctx, "staff:assign");
  const staff = await db.staffMember.findFirst({ where: { id: staffId, organizationId: ctx.organizationId, isActive: true }, select: { id: true, firstName: true, email: true } });
  if (!staff) throw new NotFoundError("Collaborateur");
  const token = generateToken();
  const expiresAt = new Date(Date.now() + PORTAL_TOKEN_TTL_MS);
  const row = await db.staffPortalToken.create({ data: { organizationId: ctx.organizationId, staffId, tokenHash: hashToken(token), expiresAt, createdById: ctx.userId }, select: { id: true } });
  await audit(ctx, "staff.portal_link_issued", "StaffPortalToken", row.id, { staffId });
  const link = `${env().APP_URL}/portal?token=${encodeURIComponent(token)}`;
  const mail =
    opts.sendEmail !== false && staff.email
      ? await sendMail({
          to: staff.email,
          subject: `${ctx.organization.name} — vos missions sur EventFlow 3D`,
          text: `Bonjour ${staff.firstName},\n\n${ctx.organization.name} vous propose des missions. Consultez-les, acceptez ou refusez-les et indiquez vos disponibilités :\n${link}\n\nCe lien personnel est valable 30 jours. Ne le transférez pas.`,
        })
      : null;
  return { link, expiresAt: expiresAt.toISOString(), mail };
}

export async function revokePortalTokens(ctx: AuthContext, staffId: string) {
  assertCan(ctx, "staff:assign");
  const r = await db.staffPortalToken.updateMany({ where: { staffId, organizationId: ctx.organizationId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(ctx, "staff.portal_links_revoked", "StaffMember", staffId, { revoked: r.count });
  return { revoked: r.count };
}

/** Résout un jeton brut. Message volontairement générique : aucun indice sur la cause du refus. */
export async function resolvePortalToken(token: string, now = new Date()): Promise<PortalContext> {
  const invalid = new UnauthorizedError("Lien invalide ou expiré");
  if (!token || token.length > 200) throw invalid;
  const row = await db.staffPortalToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true, organizationId: true, staffId: true, expiresAt: true, revokedAt: true,
      staff: { select: { firstName: true, lastName: true, isActive: true } },
      organization: { select: { name: true, timezone: true } },
    },
  });
  if (!row || row.revokedAt || row.expiresAt <= now || !row.staff.isActive) throw invalid;
  await db.staffPortalToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
  return { tokenId: row.id, organizationId: row.organizationId, staffId: row.staffId, staffName: `${row.staff.firstName} ${row.staff.lastName}`, organization: row.organization };
}
```

- [ ] **Step 5 : Relancer**

Run : `npx vitest run tests/integration/staff-portal.test.ts ; npm run typecheck`
Expected : PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/server/audit.ts src/server/services/staff-portal-token-service.ts tests/integration/staff-portal.test.ts
git commit -m "feat(portail): jetons d'accès limité (émission, révocation, résolution)"
```

---

### Task 5 : Service du portail (réponse aux propositions, disponibilités)

**Files :**
- Create : `src/features/staff-portal/schemas.ts`
- Create : `src/server/services/staff-portal-service.ts`
- Test : `tests/integration/staff-portal.test.ts`

**Interfaces :**
- Consumes : `PortalContext` (Task 4), `staffConflicts` (`scheduling.ts`), `notifyRoles`, `LOGISTICS_ROLES`, `MANAGEMENT_ROLES`, `withRetry` (`common.ts`).
- Produces :
  - `proposalResponseSchema` → `{ decision: "ACCEPT" | "DECLINE"; reason: string | null }`
  - `portalAvailabilitySchema` → `{ kind: "AVAILABLE" | "UNAVAILABLE"; startAt: Date; endAt: Date; reason: string | null }`
  - `getPortalOverview(p: PortalContext)` → `{ staffName, organization, proposals: PortalMission[], upcoming: PortalMission[], availabilities: { id, kind, startAt, endAt, reason, editable }[] }` avec `PortalMission = { id, role, status, startAt, endAt, event: { reference, name, venueName: string | null, startAt, endAt } }` (dates ISO)
  - `respondToProposal(p, assignmentId: string, input)` → `{ id: string; status: "CONFIRMED" | "DECLINED" }`
  - `declareAvailability(p, input)` → `{ id: string }`
  - `deletePortalAvailability(p, id: string)` → `void`

- [ ] **Step 1 : Écrire les tests**

```ts
import { declareAvailability, deletePortalAvailability, getPortalOverview, respondToProposal } from "@/server/services/staff-portal-service";
import type { PortalContext } from "@/server/services/staff-portal-token-service";

async function portal(): Promise<PortalContext> {
  const { link } = await issuePortalToken(ctx, staffId, { sendEmail: false });
  return resolvePortalToken(tokenOf(link));
}

describe("portail prestataire", () => {
  it("affiche les propositions sans exposer les coûts", async () => {
    const a = await createStaffAssignment(ctx, mission(8));
    const view = await getPortalOverview(await portal());
    const p = view.proposals.find((x) => x.id === a.id)!;
    expect(p).toBeDefined();
    expect(JSON.stringify(view)).not.toContain("hourlyCost");
    expect(JSON.stringify(view)).not.toContain("30.00");
  });

  it("accepter confirme l'affectation, notifie et audite", async () => {
    const a = await createStaffAssignment(ctx, mission(9));
    const res = await respondToProposal(await portal(), a.id, { decision: "ACCEPT", reason: null });
    expect(res.status).toBe("CONFIRMED");
    const row = await db.eventStaffAssignment.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.respondedAt).not.toBeNull();
    expect(await db.notification.count({ where: { organizationId: ctx.organizationId, type: "STAFF_MISSION_RESPONSE" } })).toBeGreaterThan(0);
    expect(await db.auditLog.count({ where: { entityId: a.id, action: "staff.mission_accepted", actorId: null } })).toBe(1);
  });

  it("refuser libère le créneau et conserve le motif", async () => {
    const a = await createStaffAssignment(ctx, mission(10));
    await respondToProposal(await portal(), a.id, { decision: "DECLINE", reason: "Déjà engagé ailleurs" });
    const row = await db.eventStaffAssignment.findUniqueOrThrow({ where: { id: a.id } });
    expect(row).toMatchObject({ status: "DECLINED", declineReason: "Déjà engagé ailleurs" });
    await expect(createStaffAssignment(ctx, mission(10))).resolves.toBeDefined();
  });

  it("double réponse simultanée : une seule transition", async () => {
    const a = await createStaffAssignment(ctx, mission(11));
    const p = await portal();
    const results = await Promise.allSettled([respondToProposal(p, a.id, { decision: "ACCEPT", reason: null }), respondToProposal(p, a.id, { decision: "ACCEPT", reason: null })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "ASSIGNMENT_ALREADY_ANSWERED" } });
  });

  it("refuse l'acceptation si le créneau est désormais pris", async () => {
    const a = await createStaffAssignment(ctx, mission(12));
    await db.staffAvailability.create({ data: { organizationId: ctx.organizationId, staffId, startAt: day(12, 0), endAt: day(13, 0), reason: "Congés" } });
    await expect(respondToProposal(await portal(), a.id, { decision: "ACCEPT", reason: null })).rejects.toMatchObject({ code: "SCHEDULE_CONFLICT" });
    expect((await db.eventStaffAssignment.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("PROPOSED");
  });

  it("refuse l'acceptation si l'événement a été annulé", async () => {
    const ev = await createEvent(ctx.organizationId, day(14, 8), day(14, 20));
    const a = await createStaffAssignment(ctx, { ...mission(14), eventId: ev.id });
    await db.event.update({ where: { id: ev.id }, data: { status: "CANCELLED" } });
    await expect(respondToProposal(await portal(), a.id, { decision: "ACCEPT", reason: null })).rejects.toMatchObject({ code: "EVENT_CANCELLED" });
  });

  it("ne permet pas de répondre pour un autre collaborateur", async () => {
    const other = await db.staffMember.create({ data: { organizationId: ctx.organizationId, firstName: "Paul", lastName: "Morel", employmentType: "FREELANCE" } });
    const a = await createStaffAssignment(ctx, { ...mission(15), staffId: other.id });
    await expect(respondToProposal(await portal(), a.id, { decision: "ACCEPT", reason: null })).rejects.toMatchObject({ status: 404 });
  });

  it("déclare et supprime ses disponibilités, sans toucher à celles du régisseur", async () => {
    const p = await portal();
    const mine = await declareAvailability(p, { kind: "AVAILABLE", startAt: day(16, 0), endAt: day(18, 0), reason: null });
    const managerEntry = await db.staffAvailability.create({ data: { organizationId: ctx.organizationId, staffId, startAt: day(19, 0), endAt: day(20, 0), reason: "Formation" } });
    const view = await getPortalOverview(p);
    expect(view.availabilities.find((x) => x.id === mine.id)?.editable).toBe(true);
    expect(view.availabilities.find((x) => x.id === managerEntry.id)?.editable).toBe(false);
    await expect(deletePortalAvailability(p, managerEntry.id)).rejects.toMatchObject({ status: 404 });
    await expect(deletePortalAvailability(p, mine.id)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2 : Lancer**

Run : `npx vitest run tests/integration/staff-portal.test.ts`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : Schémas** `src/features/staff-portal/schemas.ts`

```ts
import { z } from "zod";
import { optionalText } from "@/lib/zod-helpers";

export const proposalResponseSchema = z.object({
  decision: z.enum(["ACCEPT", "DECLINE"]),
  reason: optionalText(500),
});

export const portalAvailabilitySchema = z
  .object({
    kind: z.enum(["AVAILABLE", "UNAVAILABLE"]),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    reason: optionalText(200),
  })
  .refine((v) => v.endAt > v.startAt, { message: "La fin doit être après le début", path: ["endAt"] })
  .refine((v) => v.endAt.getTime() - v.startAt.getTime() <= 366 * 86_400_000, { message: "Période limitée à un an", path: ["endAt"] });
```

- [ ] **Step 4 : Service** `src/server/services/staff-portal-service.ts`

```ts
import "server-only";
import type { z } from "zod";
import { db } from "@/lib/db";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import type { portalAvailabilitySchema, proposalResponseSchema } from "@/features/staff-portal/schemas";
import { audit } from "../audit";
import { LOGISTICS_ROLES, MANAGEMENT_ROLES, notifyRoles, withRetry } from "./common";
import { staffConflicts } from "./scheduling";
import type { PortalContext } from "./staff-portal-token-service";

const actor = (p: PortalContext) => ({ organizationId: p.organizationId, userId: null });
const missionSelect = {
  id: true, role: true, status: true, startAt: true, endAt: true,
  event: { select: { reference: true, name: true, venueName: true, startAt: true, endAt: true } },
} as const;

type MissionRow = { id: string; role: string; status: string; startAt: Date; endAt: Date; event: { reference: string; name: string; venueName: string | null; startAt: Date; endAt: Date } };
const serializeMission = (m: MissionRow) => ({
  ...m,
  startAt: m.startAt.toISOString(),
  endAt: m.endAt.toISOString(),
  event: { ...m.event, startAt: m.event.startAt.toISOString(), endAt: m.event.endAt.toISOString() },
});

/** Vue du portail : uniquement les données du collaborateur du jeton, sans aucun coût. */
export async function getPortalOverview(p: PortalContext) {
  const now = new Date();
  const scope = { organizationId: p.organizationId, staffId: p.staffId };
  const [proposals, upcoming, availabilities] = await Promise.all([
    db.eventStaffAssignment.findMany({ where: { ...scope, status: "PROPOSED", endAt: { gt: now } }, orderBy: { startAt: "asc" }, select: missionSelect }),
    db.eventStaffAssignment.findMany({ where: { ...scope, status: { in: ["PLANNED", "CONFIRMED", "IN_PROGRESS"] }, endAt: { gt: now } }, orderBy: { startAt: "asc" }, take: 50, select: missionSelect }),
    db.staffAvailability.findMany({ where: { ...scope, endAt: { gt: now } }, orderBy: { startAt: "asc" }, take: 100, select: { id: true, kind: true, startAt: true, endAt: true, reason: true, declaredViaPortal: true } }),
  ]);
  return {
    staffName: p.staffName,
    organization: p.organization,
    proposals: proposals.map(serializeMission),
    upcoming: upcoming.map(serializeMission),
    availabilities: availabilities.map((a) => ({
      id: a.id, kind: a.kind, startAt: a.startAt.toISOString(), endAt: a.endAt.toISOString(),
      // Le motif d'une indisponibilité saisie par le régisseur peut être interne : on ne l'expose pas
      reason: a.declaredViaPortal ? a.reason : null,
      editable: a.declaredViaPortal,
    })),
  };
}

/** Réponse à une proposition. Seule l'acceptation du prestataire confirme l'affectation. */
export async function respondToProposal(p: PortalContext, assignmentId: string, input: z.output<typeof proposalResponseSchema>) {
  const result = await withRetry(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "StaffMember" WHERE "id" = ${p.staffId} AND "organizationId" = ${p.organizationId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Mission");
    const a = await tx.eventStaffAssignment.findFirst({
      where: { id: assignmentId, organizationId: p.organizationId, staffId: p.staffId },
      select: { id: true, status: true, role: true, startAt: true, endAt: true, event: { select: { id: true, reference: true, status: true } } },
    });
    if (!a) throw new NotFoundError("Mission");
    if (a.status !== "PROPOSED") throw new BusinessRuleError("ASSIGNMENT_ALREADY_ANSWERED", "Vous avez déjà répondu à cette proposition (ou elle a été retirée)");
    if (input.decision === "ACCEPT") {
      if (a.event.status === "CANCELLED") throw new BusinessRuleError("EVENT_CANCELLED", "L'événement a été annulé");
      const { conflicts } = await staffConflicts(tx, p.organizationId, p.staffId, a.startAt, a.endAt, { staffAssignmentId: a.id });
      if (conflicts.length > 0) throw new BusinessRuleError("SCHEDULE_CONFLICT", "Ce créneau n'est plus libre dans votre planning : contactez la régie", { conflicts: conflicts.map((c) => ({ kind: c.kind })) });
    }
    const status = input.decision === "ACCEPT" ? ("CONFIRMED" as const) : ("DECLINED" as const);
    const updated = await tx.eventStaffAssignment.updateMany({
      where: { id: a.id, status: "PROPOSED" },
      data: { status, respondedAt: new Date(), declineReason: status === "DECLINED" ? input.reason : null },
    });
    if (updated.count === 0) throw new BusinessRuleError("ASSIGNMENT_ALREADY_ANSWERED", "Vous avez déjà répondu à cette proposition");
    await audit(actor(p), status === "CONFIRMED" ? "staff.mission_accepted" : "staff.mission_declined", "EventStaffAssignment", a.id, { staffId: p.staffId, via: "portal" }, tx);
    await notifyRoles(tx, p.organizationId, [...new Set([...LOGISTICS_ROLES, ...MANAGEMENT_ROLES])], {
      type: "STAFF_MISSION_RESPONSE",
      title: `${p.staffName} a ${status === "CONFIRMED" ? "accepté" : "refusé"} la mission ${a.event.reference} (${a.role})`,
      body: status === "DECLINED" && input.reason ? `Motif : ${input.reason}` : undefined,
      link: `/events/${a.event.id}`,
      dedupeKey: `mission-response:${a.id}`,
    });
    return { id: a.id, status };
  });
  return result;
}

export async function declareAvailability(p: PortalContext, input: z.output<typeof portalAvailabilitySchema>) {
  const row = await db.staffAvailability.create({
    data: { organizationId: p.organizationId, staffId: p.staffId, kind: input.kind, startAt: input.startAt, endAt: input.endAt, reason: input.reason, declaredViaPortal: true },
    select: { id: true },
  });
  await audit(actor(p), "staff.availability_declared", "StaffAvailability", row.id, { staffId: p.staffId, kind: input.kind });
  return row;
}

export async function deletePortalAvailability(p: PortalContext, id: string) {
  const r = await db.staffAvailability.deleteMany({ where: { id, organizationId: p.organizationId, staffId: p.staffId, declaredViaPortal: true } });
  if (r.count === 0) throw new NotFoundError("Disponibilité");
  await audit(actor(p), "staff.availability_deleted", "StaffAvailability", id, { staffId: p.staffId });
}
```

> `withRetry` (`common.ts:102`) ne relance que les erreurs de sérialisation / interblocage : les `BusinessRuleError` remontent telles quelles. Le verrou `FOR UPDATE` sur `StaffMember` sérialise les réponses concurrentes ; le `updateMany … where status = PROPOSED` est un second filet.

- [ ] **Step 5 : Relancer**

Run : `npx vitest run tests/integration/staff-portal.test.ts ; npm run typecheck`
Expected : PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/features/staff-portal/schemas.ts src/server/services/staff-portal-service.ts tests/integration/staff-portal.test.ts
git commit -m "feat(portail): réponse aux propositions et déclaration des disponibilités"
```

---

### Task 6 : API du portail et du gestionnaire

**Files :**
- Modify : `src/server/api/handler.ts` (exporter `assertSameOrigin`)
- Create : `src/server/api/portal-handler.ts`
- Create : `src/app/api/portal/route.ts` (GET vue)
- Create : `src/app/api/portal/assignments/[id]/response/route.ts` (POST)
- Create : `src/app/api/portal/availability/route.ts` (POST)
- Create : `src/app/api/portal/availability/[id]/route.ts` (DELETE)
- Create : `src/app/api/staff/[id]/portal-link/route.ts` (POST émettre, DELETE révoquer)
- Modify : `src/middleware.ts`
- Test : `tests/integration/staff-portal.test.ts` (appel direct des handlers)

**Interfaces :**
- Produces : `portalHandler(options, fn)` ; en-tête `X-Portal-Token` ; réponses `{ data }` / `{ error: { code, message, details } }` identiques à `apiHandler`.

- [ ] **Step 1 : Test du handler** (ajouter au fichier)

```ts
import { NextRequest } from "next/server";
import { GET as portalGet } from "@/app/api/portal/route";
import { POST as portalRespond } from "@/app/api/portal/assignments/[id]/response/route";

describe("API du portail", () => {
  it("401 sans jeton, 200 avec jeton valide, réponse via en-tête", async () => {
    const noToken = await portalGet(new NextRequest("http://localhost/api/portal"), { params: Promise.resolve({}) });
    expect(noToken.status).toBe(401);
    const { link } = await issuePortalToken(ctx, staffId, { sendEmail: false });
    const headers = { "x-portal-token": tokenOf(link), "content-type": "application/json" };
    const ok = await portalGet(new NextRequest("http://localhost/api/portal", { headers }), { params: Promise.resolve({}) });
    expect(ok.status).toBe(200);
    const a = await createStaffAssignment(ctx, mission(21));
    const res = await portalRespond(new NextRequest(`http://localhost/api/portal/assignments/${a.id}/response`, { method: "POST", headers, body: JSON.stringify({ decision: "DECLINE", reason: "" }) }), { params: Promise.resolve({ id: a.id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("DECLINED");
  });
});
```

- [ ] **Step 2 : Lancer** — Run : `npx vitest run tests/integration/staff-portal.test.ts` — Expected : FAIL (routes absentes).

- [ ] **Step 3 : Implémenter**

`src/server/api/handler.ts` : remplacer `function assertSameOrigin` par `export function assertSameOrigin`.

`src/server/api/portal-handler.ts` :

```ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z, ZodType } from "zod";
import { AppError } from "@/lib/errors";
import { resolvePortalToken, type PortalContext } from "../services/staff-portal-token-service";
import { assertSameOrigin, errorResponse } from "./handler";

type Infer<T> = T extends ZodType ? z.infer<T> : undefined;

/**
 * Enveloppe des endpoints du portail prestataire : aucune session, aucun AuthContext.
 * Le jeton (en-tête X-Portal-Token, jamais dans l'URL de l'API) limite l'accès à un seul collaborateur.
 */
export function portalHandler<TBody extends ZodType | undefined = undefined, TResult = unknown>(
  options: { body?: TBody },
  fn: (args: { portal: PortalContext; body: Infer<TBody>; params: Record<string, string> }) => Promise<TResult>,
) {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    try {
      assertSameOrigin(req);
      const portal = await resolvePortalToken(req.headers.get("x-portal-token") ?? "");
      const params = (await context.params) ?? {};
      let body = undefined as Infer<TBody>;
      if (options.body) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          throw new AppError("BAD_REQUEST", "Corps de requête JSON invalide", 400);
        }
        body = options.body.parse(raw) as Infer<TBody>;
      }
      const result = await fn({ portal, body, params });
      const res = NextResponse.json({ data: result ?? null });
      res.headers.set("Cache-Control", "no-store");
      return res;
    } catch (error) {
      return errorResponse(error);
    }
  };
}
```

Routes :

```ts
// src/app/api/portal/route.ts
import { portalHandler } from "@/server/api/portal-handler";
import { getPortalOverview } from "@/server/services/staff-portal-service";

export const GET = portalHandler({}, ({ portal }) => getPortalOverview(portal));
```

```ts
// src/app/api/portal/assignments/[id]/response/route.ts
import { proposalResponseSchema } from "@/features/staff-portal/schemas";
import { portalHandler } from "@/server/api/portal-handler";
import { respondToProposal } from "@/server/services/staff-portal-service";

export const POST = portalHandler({ body: proposalResponseSchema }, ({ portal, params, body }) => respondToProposal(portal, params.id!, body));
```

```ts
// src/app/api/portal/availability/route.ts
import { portalAvailabilitySchema } from "@/features/staff-portal/schemas";
import { portalHandler } from "@/server/api/portal-handler";
import { declareAvailability } from "@/server/services/staff-portal-service";

export const POST = portalHandler({ body: portalAvailabilitySchema }, ({ portal, body }) => declareAvailability(portal, body));
```

```ts
// src/app/api/portal/availability/[id]/route.ts
import { portalHandler } from "@/server/api/portal-handler";
import { deletePortalAvailability } from "@/server/services/staff-portal-service";

export const DELETE = portalHandler({}, ({ portal, params }) => deletePortalAvailability(portal, params.id!));
```

```ts
// src/app/api/staff/[id]/portal-link/route.ts
import { apiHandler } from "@/server/api/handler";
import { issuePortalToken, revokePortalTokens } from "@/server/services/staff-portal-token-service";

export const POST = apiHandler({}, ({ ctx, params }) => issuePortalToken(ctx, params.id!));
export const DELETE = apiHandler({}, ({ ctx, params }) => revokePortalTokens(ctx, params.id!));
```

`src/middleware.ts` :

```ts
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/accept-invitation", "/portal"];
```

- [ ] **Step 4 : Relancer** — Run : `npx vitest run tests/integration/staff-portal.test.ts ; npm run typecheck ; npm run lint` — Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/server/api src/app/api/portal "src/app/api/staff/[id]/portal-link" src/middleware.ts tests/integration/staff-portal.test.ts
git commit -m "feat(portail): API à jeton limité et lien de portail côté gestionnaire"
```

---

### Task 7 : Interface du portail prestataire

**Files :**
- Create : `src/app/portal/layout.tsx`, `src/app/portal/page.tsx`
- Create : `src/features/staff-portal/components/portal-view.tsx`

**Interfaces :**
- Consumes : `GET /api/portal`, `POST /api/portal/assignments/:id/response`, `POST /api/portal/availability`, `DELETE /api/portal/availability/:id` ; `getPortalOverview`, `resolvePortalToken`.

- [ ] **Step 1 : Page serveur** `src/app/portal/page.tsx`

```tsx
import { Alert } from "@/components/feedback/alert";
import { PortalView } from "@/features/staff-portal/components/portal-view";
import { isAppError } from "@/lib/errors";
import { getPortalOverview } from "@/server/services/staff-portal-service";
import { resolvePortalToken } from "@/server/services/staff-portal-token-service";

export const metadata = { title: "Mes missions", referrer: "no-referrer", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PortalPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  try {
    const portal = await resolvePortalToken(token ?? "");
    const overview = await getPortalOverview(portal);
    return <PortalView token={token!} initial={overview} />;
  } catch (e) {
    if (!isAppError(e)) throw e;
    return <Alert tone="danger" title="Lien invalide">Ce lien est invalide, expiré ou a été révoqué. Demandez un nouveau lien à votre contact.</Alert>;
  }
}
```

`src/app/portal/layout.tsx` : reprendre la mise en page centrée de `src/app/(auth)/layout.tsx` en élargissant le conteneur à `max-w-3xl` (pas de barre latérale, pas d'accès au workspace).

- [ ] **Step 2 : Composant client** `src/features/staff-portal/components/portal-view.tsx`

Contenu (composants existants : `Card`, `Button`, `Badge`, `Input`, `Field`, `Alert`, `toast` de `sonner`, `formatDateTime` de `@/lib/dates`, `availabilityKindLabels`) :

```tsx
"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/dates";
import { availabilityKindLabels } from "@/lib/labels";
import type { getPortalOverview } from "@/server/services/staff-portal-service";

type Overview = Awaited<ReturnType<typeof getPortalOverview>>;

export function PortalView({ token, initial }: { token: string; initial: Overview }) {
  const [data, setData] = useState(initial);
  const tz = data.organization.timezone;
  const call = async (url: string, init: { method: string; body?: unknown }) => {
    const res = await fetch(url, { method: init.method, headers: { "content-type": "application/json", "x-portal-token": token }, body: init.body ? JSON.stringify(init.body) : undefined });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? "Erreur");
    return json.data;
  };
  const refresh = async () => setData(await call("/api/portal", { method: "GET" }));
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };
  // … rendu : en-tête « Bonjour {staffName} — {organization.name} »,
  // section « Propositions en attente » (une Card par mission : événement, rôle, horaires, lieu ;
  //   bouton « Accepter » → POST response {decision:"ACCEPT"} ; bouton « Refuser » qui ouvre un champ motif facultatif
  //   puis POST {decision:"DECLINE", reason}),
  // section « Missions confirmées » (liste lecture seule),
  // section « Mes disponibilités » : formulaire (type Disponible/Indisponible, début, fin datetime-local, motif)
  //   → POST /api/portal/availability ; liste avec bouton Supprimer seulement si editable.
}
```

Écrire le JSX complet en suivant le style de `src/app/(workspace)/team/[id]/page.tsx` (Cards, `divide-y`, `tabular-nums`). Conversion `datetime-local` → ISO : `toIso` / `toLocal` sont des constantes locales de `src/features/events/components/event-dialogs.tsx:27-28` ; les déplacer (exportées) dans `src/lib/dates.ts` et les importer des deux côtés.
Accessibilité : boutons avec libellé explicite (« Accepter la mission EVT-… »), `aria-live="polite"` sur la zone des propositions, cibles tactiles ≥ 44 px (le portail est surtout ouvert sur mobile).

- [ ] **Step 3 : Vérifier manuellement**

Run : `npm run dev`, générer un lien (Task 8 ou `npx tsx` + `issuePortalToken`), ouvrir `/portal?token=…` sans être connecté, en vue mobile (375 px) : accepter, refuser, déclarer, supprimer.
Expected : aucune redirection vers `/login`, toasts corrects, aucune erreur console.

- [ ] **Step 4 : Commit**

```bash
git add src/app/portal src/features/staff-portal/components
git commit -m "feat(portail): interface prestataire (propositions, missions, disponibilités)"
```

---

### Task 8 : Interface gestionnaire

**Files :**
- Modify : `src/features/events/components/event-dialogs.tsx` (`AssignStaffDialog`)
- Modify : `src/server/services/staff-service.ts` (`staffOptions` renvoie `employmentType`)
- Modify : `src/app/(workspace)/events/[id]/page.tsx` (badges, motif de refus)
- Create : `src/features/staff/components/portal-link-card.tsx`
- Modify : `src/app/(workspace)/team/[id]/page.tsx` (carte lien portail, onglet disponibilités)
- Modify : `src/features/staff/components/staff-dialogs.tsx` (`UnavailabilityDialog` : choix du type)
- Modify : `src/app/(workspace)/planning/page.tsx:44` (couleurs)

- [ ] **Step 1 : Option « Proposer »**

`staffOptions` : ajouter `employmentType: true` au `select` et `employmentType: r.employmentType` à l'option.
Dans `AssignStaffDialog` : état `const [propose, setPropose] = useState(false);` ; quand `staffId` change, `setPropose(["FREELANCE", "INTERMITTENT"].includes(selected?.employmentType ?? ""))` ; case à cocher (`Checkbox`) « Proposer la mission (confirmée après acceptation du prestataire) » ; `propose` ajouté à `body` ; bouton « Proposer » au lieu de « Affecter » quand coché ; toast « Proposition envoyée » ; après succès, si `propose`, appeler `POST /api/staff/${staffId}/portal-link` pour envoyer le lien par e-mail et afficher dans le toast si `mail` vaut `null` (« pas d'e-mail : copiez le lien depuis la fiche »).

- [ ] **Step 2 : Fiche événement**

Badge par statut : `PROPOSED` → `tone="warning"`, `DECLINED` → `tone="danger"`, autres inchangés. Ajouter `declineReason: true` et `respondedAt: true` à la requête des `staffAssignments` du service événement (chercher `staffAssignments:` dans `src/server/services/event-service.ts`) ; afficher le motif sous le badge en `text-muted-foreground`. Masquer l'action de changement de statut autre qu'« Annuler » pour `PROPOSED`, toute action pour `DECLINED`.

- [ ] **Step 3 : Carte « Portail prestataire »** sur `/team/[id]` (visible si `can(ctx, "staff:assign")`)

Boutons : « Envoyer le lien par e-mail » (`POST /api/staff/:id/portal-link`, affiche ensuite le lien avec bouton Copier — utile si pas d'e-mail ou `MAIL_DRIVER=disabled`) et « Révoquer tous les liens » (`DELETE`, confirmation destructive). Afficher le nombre de liens actifs et la date de dernière utilisation : ajouter à `getStaffMember` `portalTokens: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { lastUsedAt: true, expiresAt: true } }`.

- [ ] **Step 4 : Onglet disponibilités**

Renommer l'onglet « Disponibilités », afficher `availabilityKindLabels[u.kind]` en `Badge` (`AVAILABLE` → `tone="success"`) et la mention « saisie par le prestataire » si `declaredViaPortal`. `UnavailabilityDialog` : sélecteur type (défaut Indisponible) envoyé dans `kind`.

- [ ] **Step 5 : Planning**

```ts
const colors: Record<string, string> = { assignment: "bg-primary/80", proposal: "bg-primary/40 border border-dashed border-primary", driving: "bg-info/80", unavailable: "bg-muted-foreground/40", available: "bg-success/50", maintenance: "bg-warning/80", mission: "bg-primary/80" };
```

Ajouter la légende correspondante si la page en a une.

- [ ] **Step 6 : Vérifier**

Run : `npm run typecheck ; npm run lint ; npm test`
Puis `npm run dev` : proposer une mission à un intermittent, ouvrir le lien (fichier dans `storage/mail-outbox/` si `MAIL_DRIVER=file`), accepter, vérifier badge « Confirmée » + notification côté gestionnaire.
Expected : tout vert, parcours fonctionnel.

- [ ] **Step 7 : Commit**

```bash
git add src
git commit -m "feat(staff): proposer une mission et gérer le lien du portail depuis l'app"
```

---

### Task 9 : Parcours E2E et documentation

**Files :**
- Create : `tests/e2e/staff-portal.spec.ts`
- Modify : `docs/BUSINESS_RULES.md`, `docs/SECURITY.md`, `docs/DATABASE.md`, `ROADMAP.md`, `README.md` (section fonctionnalités)

- [ ] **Step 1 : Test E2E** (s'inspirer de `tests/e2e/business-flows.spec.ts` et `helpers.ts` pour la connexion)

```ts
import { expect, test } from "@playwright/test";
import { login, USERS } from "./helpers";

test("un intermittent accepte une mission via le portail", async ({ page, browser }) => {
  await login(page, USERS.owner);
  // 1. ouvrir un événement du seed, « Affecter », choisir un collaborateur INTERMITTENT, laisser « Proposer » coché, valider
  // 2. ouvrir sa fiche /team/:id, cliquer « Envoyer le lien par e-mail », lire le lien affiché
  const link = await page.getByTestId("portal-link").inputValue();
  // 3. contexte anonyme : pas de cookie de session
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(link);
  await anon.getByRole("button", { name: /Accepter la mission/ }).first().click();
  await expect(anon.getByText("Mission acceptée")).toBeVisible();
  // 4. retour gestionnaire : badge « Confirmée »
  await page.goBack();
  await page.reload();
  await expect(page.getByText("Confirmée").first()).toBeVisible();
});
```

Ajouter `data-testid="portal-link"` à l'`Input` en lecture seule de la carte (Task 8). Vérifier que le seed contient au moins un `StaffMember` `INTERMITTENT` actif ; sinon en ajouter un dans `prisma/seed.ts`.

Run : `npm run test:e2e -- staff-portal`
Expected : PASS.

- [ ] **Step 2 : Documentation**

- `BUSINESS_RULES.md` : cycle `PROPOSED → CONFIRMED | DECLINED | CANCELLED` ; une proposition bloque le créneau ; seule l'acceptation confirme ; acceptation re-vérifie conflits et statut de l'événement ; disponibilités `AVAILABLE` indicatives, `UNAVAILABLE` bloquantes ; le prestataire ne supprime que ses propres saisies.
- `SECURITY.md` : jeton portail 256 bits, hash SHA-256, 30 jours, révocable, portée = un collaborateur ; en-tête `X-Portal-Token` (jamais dans l'URL d'API) ; page en `Referrer-Policy: no-referrer` + `noindex` ; message d'erreur générique ; aucune donnée de coût exposée ; actions auditées sans acteur.
- `DATABASE.md` : `StaffPortalToken`, nouveaux champs et enums.
- `ROADMAP.md` : cocher « Portail freelance et intermittents » ; ajouter les suites ci-dessous.

- [ ] **Step 3 : Vérification finale**

Run : `npm run typecheck ; npm run lint ; npm test ; npm run build`
Expected : tout PASS.

- [ ] **Step 4 : Commit**

```bash
git add tests/e2e/staff-portal.spec.ts docs ROADMAP.md README.md prisma/seed.ts
git commit -m "docs(portail): règles métier, sécurité et parcours E2E du portail prestataires"
```

---

## Hors périmètre (suites possibles du portail prestataires)

- Expiration automatique des propositions sans réponse (job dans `scripts/run-alerts.ts`) et relance.
- Saisie des heures (`Timesheet`) et dépôt de documents (fiche de paie, facture freelance) par le prestataire.
- Contre-proposition d'horaires, chat avec la régie.
- Suggestion automatique des prestataires `AVAILABLE` dans `AssignStaffDialog`.
- Limitation de débit sur `/api/portal/*` (un jeton de 256 bits rend la force brute irréaliste ; à ajouter si le portail est exposé à un trafic important).
