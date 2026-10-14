# Cahier des charges définitif — ERP 3D pour ton agence événementielle

Pour ton agence généraliste, avec moins de 500 références de matériel et une interface immersive inspirée des jeux vidéo, je recommande de construire un ERP événementiel piloté par un entrepôt 3D interactif.

Le logiciel doit gérer l'ensemble de ton activité : bureau, clients, événements, matériel, stocks, camions, équipes, achats, devis, factures et rentabilité. La 3D sera l'interface principale, mais chaque action devra fonctionner avec de vraies données enregistrées en base.

L'objectif est de pouvoir exploiter l'agence depuis un seul logiciel, sans devoir jongler entre plusieurs fichiers Excel, calendriers et listes de chargement.

## 1. Le concept de l'application

[Логистика и управление цепями поставок в условиях кризиса 2025 | Клеверенс](https://images.openai.com/static-rsc-4/Zkco5xlO3vznXwWKNR94HkJg-vn8plfP0rUir9MZCnOGeWIVNbH5keEKl_EV9i1B2gLMsLL2f-U8aJxSZ5RRaDreEFqhnyQd3zrznWHdu5yNcGh9oPgdVkDl9ssecCC8rcP1g5Nmlrg2L2X5q8Yjzk9NjMfSvciTH8KkLzTg4lQ?purpose=inline)

[cleverence.ru](https://www.cleverence.ru/articles/elektronnaya-kommertsiya/-logistika-i-upravlenie-tsepyami-postavok-v-usloviyah-krizisa-2025/)

Je structurerais l'application en cinq espaces reliés.

1\. Bureau virtuel

Clients, devis, projets, tâches, calendrier, collaborateurs, dépenses et indicateurs de l'agence.

2\. Entrepôt virtuel

Rayonnages, flight-cases, son, lumière, vidéo, mobilier, décoration, structures, tentes, câbles et consommables.

3\. Zone logistique

Camions, utilitaires, chargements, tournées, départs, retours, matériel manquant et maintenance.

4\. Événements en cours

Chaque événement possède son dossier, ses ressources réservées, son équipe, son transport, son planning et son budget.

5\. Centre de pilotage

Vue globale des événements, disponibilités, alertes, trésorerie suivie et rentabilité.

## 2. Architecture technique définitive

Pour moins de 500 références, une architecture modulaire unique est préférable à une multitude de microservices. Elle est plus simple à développer, à déployer et à maintenir.

Interface Next.js

React · TypeScript · Tailwind · shadcn/ui

API sécurisée et validations

Backend modulaire

Services métier · permissions · transactions · événements internes

PostgreSQL

Données persistantes

Scène 3D

Objets interactifs GLB

E-mails et documents

Devis, PDF, notifications

Tâches asynchrones

Rappels et automatisations

### Technologies retenues

| Élément          | Choix                                          | Pourquoi                                      |
| ---------------- | ---------------------------------------------- | --------------------------------------------- |
| Frontend         | Next.js + TypeScript                           | Application web complète                      |
| 3D               | React Three Fiber + Three.js                   | Scène interactive dans le navigateur          |
| Modélisation     | Blender + GLB                                  | Entrepôt, bureaux, camions et matériel        |
| Interface        | Tailwind CSS + shadcn/ui                       | Panneaux et formulaires cohérents             |
| Backend          | Next.js Route Handlers + couche métier serveur | Éviter un backend séparé inutile au départ    |
| Base de données  | PostgreSQL                                     | Relations, transactions et cohérence du stock |
| ORM              | Prisma                                         | Modèles, migrations et accès typé             |
| Authentification | Auth.js ou fournisseur équivalent              | Sessions et identité des utilisateurs         |
| Validation       | Zod                                            | Contrôle des données entrantes                |
| Temps réel       | Socket.IO, en phase 2 si nécessaire            | Actualisation entre plusieurs utilisateurs    |
| Documents        | Stockage compatible S3                         | Photos, contrats et PDF                       |
| Tests            | Vitest + Playwright                            | Logique métier et parcours utilisateurs       |

Je ne mettrais pas NestJS, Redis et BullMQ dès le premier jour. Ils pourront être ajoutés si les besoins d'intégration, les volumes de tâches ou les contraintes de disponibilité le justifient.

## 3. Structure définitive du dépôt

Voici l'organisation que je ferais créer à l'agent de développement.

```

eventflow-3d/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── public/
│   └── models/
│       ├── warehouse.glb
│       ├── office.glb
│       ├── truck.glb
│       └── equipment/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   ├── (workspace)/
│   │   │   ├── dashboard/
│   │   │   ├── world/
│   │   │   ├── events/
│   │   │   ├── inventory/
│   │   │   ├── logistics/
│   │   │   ├── team/
│   │   │   ├── customers/
│   │   │   ├── quotes/
│   │   │   ├── invoices/
│   │   │   └── settings/
│   │   └── api/
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   └── forms/
│   ├── features/
│   │   ├── events/
│   │   ├── inventory/
│   │   ├── reservations/
│   │   ├── logistics/
│   │   ├── vehicles/
│   │   ├── staff/
│   │   ├── finance/
│   │   └── customers/
│   ├── three/
│   │   ├── scenes/
│   │   ├── objects/
│   │   ├── interactions/
│   │   ├── materials/
│   │   └── loaders/
│   ├── server/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── permissions/
│   │   └── validators/
│   └── lib/
│       ├── auth/
│       ├── db/
│       └── utils/
├── tests/
├── .env.example
├── package.json
└── README.md

```

Règle importante : les composants 3D affichent les données fournies par les services métier. Ils ne modifient jamais directement la base de données et ne décident jamais seuls si une réservation est autorisée.

# 4. Schéma PostgreSQL / Prisma

Le modèle de données doit couvrir les opérations réelles sans devenir inutilement complexe.

Il faut distinguer :

- Le produit catalogue : par exemple une référence « Enceinte active 12 pouces ».
- L'équipement individuel : une enceinte précise avec son numéro de série, si tu souhaites la suivre individuellement.
- Le stock : quantité physique disponible par emplacement.
- La réservation : quantité prévue pour un événement et une période.
- Le mouvement de stock : trace d'une entrée, d'une sortie, d'un transfert ou d'un ajustement.

Cette distinction permet de gérer aussi bien 100 câbles identiques que 4 consoles numérotées individuellement.

## 4.1 Schéma Prisma de départ

Le code suivant constitue un socle cohérent pour les principaux domaines. Il est conçu pour PostgreSQL et Prisma. Les modules de facturation, d'achats et de gestion fine des droits seront ajoutés dans les migrations suivantes.

```

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  OWNER
  ADMIN
  PROJECT_MANAGER
  LOGISTICS
  TECHNICIAN
  ACCOUNTING
  VIEWER
}

enum EventStatus {
  LEAD
  QUOTE
  CONFIRMED
  PREPARATION
  READY
  SETUP
  LIVE
  STRIKE
  RETURN
  CLOSED
  CANCELLED
}

enum ReservationStatus {
  DRAFT
  CONFIRMED
  PREPARING
  DISPATCHED
  RETURNED
  CANCELLED
}

enum StockMovementType {
  RECEIPT
  DISPATCH
  RETURN
  TRANSFER_IN
  TRANSFER_OUT
  ADJUSTMENT
  DAMAGE
  LOSS
}

enum VehicleStatus {
  AVAILABLE
  ASSIGNED
  MAINTENANCE
  UNAVAILABLE
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
  BLOCKED
}

model Organization {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  memberships Membership[]
  customers   Customer[]
  events      Event[]
  products    EquipmentProduct[]
  locations   StockLocation[]
  vehicles    Vehicle[]
  sceneObjects SceneObject[]
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())

  memberships Membership[]
  assignedTasks Task[] @relation("TaskAssignee")
}

model Membership {
  id             String @id @default(cuid())
  organizationId String
  userId         String
  role           Role   @default(TECHNICIAN)

  organization Organization @relation(
    fields: [organizationId],
    references: [id],
    onDelete: Cascade
  )
  user User @relation(
    fields: [userId],
    references: [id],
    onDelete: Cascade
  )

  @@unique([organizationId, userId])
  @@index([userId])
}

model Customer {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  email          String?
  phone          String?
  notes          String?
  createdAt      DateTime @default(now())

  organization Organization @relation(
    fields: [organizationId],
    references: [id]
  )
  events Event[]

  @@index([organizationId, name])
}

model Event {
  id             String      @id @default(cuid())
  organizationId String
  customerId     String?
  name           String
  venue          String?
  startsAt       DateTime
  endsAt         DateTime
  status         EventStatus @default(LEAD)
  budget         Decimal?    @db.Decimal(12, 2)
  notes          String?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  organization Organization @relation(
    fields: [organizationId],
    references: [id]
  )
  customer Customer? @relation(
    fields: [customerId],
    references: [id],
    onDelete: SetNull
  )
  reservations Reservation[]
  tasks        Task[]
  staff        EventStaffAssignment[]
  vehicleAssignments VehicleAssignment[]

  @@index([organizationId, startsAt, endsAt])
  @@index([organizationId, status])
}

model EquipmentProduct {
  id             String   @id @default(cuid())
  organizationId String
  sku            String
  name           String
  category       String
  unit           String   @default("unit")
  serialized     Boolean  @default(false)
  replacementCost Decimal? @db.Decimal(12, 2)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(
    fields: [organizationId],
    references: [id]
  )
  balances       StockBalance[]
  movements      StockMovement[]
  reservationLines ReservationLine[]
  assets         EquipmentAsset[]

  @@unique([organizationId, sku])
  @@index([organizationId, category])
}

model StockLocation {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  code           String
  kind           String   @default("WAREHOUSE")
  createdAt      DateTime @default(now())

  organization Organization @relation(
    fields: [organizationId],
    references: [id]
  )
  balances StockBalance[]
  movements StockMovement[]
  sceneObjects SceneObject[]

  @@unique([organizationId, code])
}

model StockBalance {
  id        String @id @default(cuid())
  productId String
  locationId String
  quantity  Int    @default(0)
  updatedAt DateTime @updatedAt

  product EquipmentProduct @relation(
    fields: [productId],
    references: [id]
  )
  location StockLocation @relation(
    fields: [locationId],
    references: [id]
  )

  @@unique([productId, locationId])
}

model EquipmentAsset {
  id          String @id @default(cuid())
  productId   String
  serialNumber String?
  status      String @default("AVAILABLE")
  notes       String?

  product EquipmentProduct @relation(
    fields: [productId],
    references: [id]
  )

  @@unique([productId, serialNumber])
}

model Reservation {
  id        String @id @default(cuid())
  eventId   String
  startsAt  DateTime
  endsAt    DateTime
  status    ReservationStatus @default(DRAFT)
  createdAt DateTime @default(now())

  event Event @relation(
    fields: [eventId],
    references: [id]
  )
  lines ReservationLine[]

  @@index([startsAt, endsAt, status])
}

model ReservationLine {
  id            String @id @default(cuid())
  reservationId String
  productId     String
  quantity      Int
  returned      Int    @default(0)

  reservation Reservation @relation(
    fields: [reservationId],
    references: [id],
    onDelete: Cascade
  )
  product EquipmentProduct @relation(
    fields: [productId],
    references: [id]
  )

  @@unique([reservationId, productId])
}

model StockMovement {
  id         String @id @default(cuid())
  productId  String
  locationId String
  type       StockMovementType
  quantity   Int
  reference  String?
  note       String?
  createdAt  DateTime @default(now())

  product EquipmentProduct @relation(
    fields: [productId],
    references: [id]
  )
  location StockLocation @relation(
    fields: [locationId],
    references: [id]
  )

  @@index([productId, createdAt])
  @@index([locationId, createdAt])
}

model Vehicle {
  id             String @id @default(cuid())
  organizationId String
  registration   String
  name           String
  capacityKg     Int?
  volumeM3       Decimal? @db.Decimal(8, 2)
  status         VehicleStatus @default(AVAILABLE)

  organization Organization @relation(
    fields: [organizationId],
    references: [id]
  )
  assignments VehicleAssignment[]

  @@unique([organizationId, registration])
}

model VehicleAssignment {
  id        String @id @default(cuid())
  vehicleId String
  eventId   String
  startsAt  DateTime
  endsAt    DateTime
  driverName String?

  vehicle Vehicle @relation(
    fields: [vehicleId],
    references: [id]
  )
  event Event @relation(
    fields: [eventId],
    references: [id]
  )

  @@index([vehicleId, startsAt, endsAt])
}

model EventStaffAssignment {
  id       String @id @default(cuid())
  eventId  String
  userId   String
  roleName String
  startsAt DateTime
  endsAt   DateTime

  event Event @relation(
    fields: [eventId],
    references: [id],
    onDelete: Cascade
  )

  @@index([userId, startsAt, endsAt])
}

model Task {
  id          String @id @default(cuid())
  eventId     String?
  assigneeId  String?
  title       String
  status      TaskStatus @default(TODO)
  dueAt       DateTime?
  createdAt   DateTime @default(now())

  event Event? @relation(
    fields: [eventId],
    references: [id],
    onDelete: SetNull
  )
  assignee User? @relation(
    "TaskAssignee",
    fields: [assigneeId],
    references: [id],
    onDelete: SetNull
  )

  @@index([assigneeId, status, dueAt])
}

model SceneObject {
  id             String @id @default(cuid())
  organizationId String
  locationId     String?
  objectKey      String
  objectType     String
  positionX      Float @default(0)
  positionY      Float @default(0)
  positionZ      Float @default(0)
  rotationY      Float @default(0)
  scale          Float @default(1)
  visible        Boolean @default(true)

  organization Organization @relation(
    fields: [organizationId],
    references: [id]
  )
  location StockLocation? @relation(
    fields: [locationId],
    references: [id],
    onDelete: SetNull
  )

  @@unique([organizationId, objectKey])
}

```

## 4.2 Modèles complémentaires à ajouter avant la mise en production

Le schéma précédent couvre le noyau opérationnel. Pour disposer de l'ERP complet, ajoute également les modèles suivants.

| Modèle              | Champs principaux                                                                      | Utilité                       |
| ------------------- | -------------------------------------------------------------------------------------- | ----------------------------- |
| `Quote`             | `organizationId`, `customerId`, `eventId`, `number`, `status`, `total`                 | Devis clients                 |
| `QuoteLine`         | `quoteId`, `description`, `quantity`, `unitPrice`, `taxRate`                           | Détail du devis               |
| `Invoice`           | `organizationId`, `customerId`, `eventId`, `number`, `status`, `total`, `dueAt`        | Facturation                   |
| `Payment`           | `invoiceId`, `amount`, `paidAt`, `method`, `reference`                                 | Encaissements                 |
| `Supplier`          | `organizationId`, `name`, `email`, `phone`                                             | Fournisseurs                  |
| `PurchaseOrder`     | `organizationId`, `supplierId`, `number`, `status`                                     | Commandes d'achat             |
| `PurchaseOrderLine` | `purchaseOrderId`, `productId`, `quantity`, `unitCost`                                 | Lignes d'achat                |
| `MaintenanceTicket` | `organizationId`, `productId` ou `assetId`, `status`, `description`, `scheduledAt`     | Entretien et réparations      |
| `ReturnInspection`  | `reservationId`, `productId`, `quantityReturned`, `quantityDamaged`, `quantityMissing` | Contrôle des retours          |
| `EventExpense`      | `eventId`, `category`, `amount`, `description`                                         | Calcul de rentabilité         |
| `Document`          | `organizationId`, `eventId`, `storageKey`, `mimeType`                                  | Contrats, photos et documents |
| `AuditLog`          | `organizationId`, `userId`, `action`, `entityType`, `entityId`, `createdAt`            | Traçabilité                   |
| `Notification`      | `organizationId`, `userId`, `type`, `readAt`                                           | Alertes utilisateurs          |

Les numéros de devis, factures et commandes doivent être générés de façon concurrente et sécurisée côté serveur. Pour les factures émises, prévois une gestion de l'historique et des corrections conforme aux règles applicables.

### Trois corrections essentielles au schéma

Avant de lancer les migrations de production :

1. Isolation des organisations. Chaque requête doit vérifier que l'utilisateur peut accéder à l'organisation et à la ressource demandée. Ajoute des clés étrangères composites ou des contraintes équivalentes pour empêcher les relations entre données de deux organisations différentes. Pour les tables dont l'appartenance est héritée d'un parent, impose systématiquement cette vérification dans les services métier.
2. Traçabilité du stock. Les mouvements doivent être conservés comme historique immuable. Les soldes peuvent être stockés pour accélérer les lectures, mais chaque opération doit mettre à jour le journal et le solde dans une même transaction.
3. Relations manquantes. Relie les affectations du personnel à `User` ou à un modèle `Employee` approprié. Prévois aussi un identifiant de ressource métier dans `SceneObject`, afin qu'un objet 3D puisse être associé à un camion, un emplacement ou un équipement précis.

Le schéma doit être validé avec la version de Prisma retenue, puis testé avec de vraies migrations sur une base de développement.

# 5. Le moteur de réservation : le cœur de ton ERP

Pour une agence événementielle, la fonction la plus importante après la gestion des événements est la disponibilité du matériel.

Supposons que tu possèdes 20 projecteurs identiques.

- Événement A : 12 projecteurs du 10 au 12 juin.
- Événement B : 10 projecteurs du 11 au 13 juin.

Ces deux réservations se chevauchent : il faut 22 projecteurs sur la période commune, donc le système doit refuser la seconde réservation si elle est confirmée et qu'aucune autre solution n'est disponible.

La disponibilité doit être calculée ainsi :

\\[ \text{Disponible}(t)= \text{Stock utilisable} -\text{Réservations actives}(t) \\]

Le stock utilisable exclut le matériel en maintenance, perdu ou déjà immobilisé. Les réservations doivent tenir compte des heures de préparation, de transport et de retour, et pas uniquement des dates de l'événement.

Pour empêcher deux utilisateurs de réserver simultanément les mêmes ressources, le backend doit effectuer le contrôle et la confirmation dans une transaction avec un verrouillage adapté ou une autre stratégie de concurrence éprouvée. Un simple contrôle dans le frontend ne suffit pas.

# 6. Comment relier le monde 3D aux données réelles

La scène 3D ne doit pas être un décor indépendant. Elle doit être un véritable poste de contrôle opérationnel.

[Rentals  -  Yushi Group Co., Ltd. - YUSHI GROUP](https://images.openai.com/static-rsc-4/4lILqYLhhY-FbGprA056mZCqGHPDX8oA_GvRrhBqHPtoaSM4ZUDsKZWa84_8zKgbSbNupkfGFTXt_W9bciFsDDbM_qy7hvnm6t6GUKUlU-9c3obgpdbq5h5h9Q3vyJiOgk7Zgw-T6eej6ApEZX-c9yxetOJwB06m-Mxi4STPQd8?purpose=inline)

Rayonnage sélectionné

Affiche les produits stockés, les quantités, les emplacements et les alertes de réapprovisionnement.

[Megapoly.Art - Warehouse Pack | Fab](https://images.openai.com/static-rsc-4/-wnNdswkWtemaOSVo1VVXHvhrK0TqU02KrF_78r3dG-4U7bfiAXQX58drJ9IHCM2-D8leNrSSbP7wdjjfoKtn8NKBmUnpFMlsdfJCoBw8GwaarNqD4TdiTw3UDAnIkLdlxgdXDmzcb99y3bLRfNh7wb9VxsONykumki-MrvEs2o?purpose=inline)

Camion sélectionné

Affiche les événements affectés, la capacité, le conducteur, les heures de départ et la liste de chargement.

[DownstageEdge.co.uk | Touring Stage Builder & Set Carpenter](https://images.openai.com/static-rsc-4/b2S_uOKmIlcBypcQWcoB5Hq7QwSKG8QUPFuYBqFnxhInHmG5UxJjaN-mI2n0YzCvW9emVby2NBo0J_FNKA_xrDlhgsGqMJqZcxY4JfvXT2zC4LMkp9DInqeevoHfQLPgPGhAamvcUCod80nKDIsG2PfItCyjoZRMJMIpgqe9xj0?purpose=inline)

Zone de préparation sélectionnée

Affiche les commandes en cours de préparation, le matériel manquant et les contrôles restant à effectuer.

### Le mécanisme technique

Chaque objet possède un identifiant stable, par exemple :

```
type SceneEntity =
  | { type: "location"; id: string }
  | { type: "vehicle"; id: string }
  | { type: "equipment"; id: string }
  | { type: "event"; id: string };
```

Au clic sur un objet :

1. La scène transmet son type et son identifiant au frontend.
2. Le frontend appelle l'API correspondante.
3. Le backend vérifie les permissions et charge les données.
4. Un panneau contextuel affiche les informations.
5. L'utilisateur réalise une action autorisée.
6. Le backend valide l'opération et enregistre les changements.
7. La scène actualise l'objet à partir du résultat confirmé.

Pour une première version, tu peux charger l'ensemble des objets de l'entrepôt en une requête. Avec moins de 500 références, cette approche sera généralement suffisante si les modèles 3D et les textures restent raisonnables.

Il faudra néanmoins optimiser la géométrie, les matériaux et le chargement des modèles pour conserver une navigation fluide.

# 7. Ordre exact de création du code

Je te recommande de développer en 10 phases. Chaque phase doit être testée avant de passer à la suivante.

## 01

Initialiser le projet

Next.js, TypeScript, Tailwind, shadcn/ui, Prisma et PostgreSQL. Créer `.env.example`, configurer le linting et initialiser Git.

Fondations

## 02

Base de données et authentification

Créer les modèles, les migrations, les utilisateurs, les organisations, les rôles et les protections d'accès.

Sécurité

## 03

Catalogue et entrepôt

Créer les références de matériel, les emplacements, les stocks, les mouvements et les imports CSV.

## 04

Clients et événements

Développer les fiches clients, les événements, les calendriers, les tâches, les devis et les contrats.

## 05

Réservations et logistique

Implémenter les disponibilités, les listes de préparation, les sorties, les retours et les conflits.

Critique

## 06

Flotte et personnel

Ajouter les camions, capacités, chauffeurs, équipes, plannings et alertes de maintenance.

## 07

Construire la scène 3D

Modéliser l'entrepôt, les bureaux et le quai dans Blender. Charger les GLB, placer les objets et créer les interactions.

Expérience immersive

## 08

Finance et documents

Devis PDF, factures, paiements, commandes fournisseurs, dépenses et rentabilité par événement.

## 09

Automatisations et temps réel

Notifications, alertes de stock, synchronisation entre utilisateurs et rappels de préparation.

## 10

Tests et déploiement

Tests de permissions, réservations simultanées, sauvegardes, restauration, performance 3D et mise en production.

## 8. Les premières commandes à exécuter

Pour démarrer avec Next.js et Prisma, dans un terminal :

```
npx create-next-app@latest eventflow-3d
cd eventflow-3d

npx shadcn@latest init

npm install three @react-three/fiber @react-three/drei
npm install prisma @prisma/client
npm install zod react-hook-form @hookform/resolvers
npm install lucide-react

npx prisma init
```

Configure ensuite `DATABASE_URL` dans ton fichier `.env`, prépare une instance PostgreSQL et définis le schéma Prisma avant de créer la première migration.

```
npx prisma format
npx prisma validate
npx prisma migrate dev --name initial_schema
npx prisma generate
npm run dev
```

Ces commandes constituent le démarrage du projet, pas une application déjà fonctionnelle. Il faut encore implémenter les modèles, les services métier, les pages et les tests.

## 9. Les API à développer

| Domaine             | Routes principales                |
| ------------------- | --------------------------------- |
| Clients             | `GET/POST /api/customers`         |
| Événements          | `GET/POST /api/events`            |
| Réservations        | `GET/POST /api/reservations`      |
| Disponibilités      | `GET /api/inventory/availability` |
| Matériel            | `GET/POST /api/equipment`         |
| Mouvements de stock | `POST /api/stock/movements`       |
| Préparation         | `POST /api/preparations`          |
| Retours             | `POST /api/returns`               |
| Véhicules           | `GET/POST /api/vehicles`          |
| Équipes             | `GET/POST /api/staff-assignments` |
| Scène 3D            | `GET /api/scene`                  |
| Documents           | `GET/POST /api/documents`         |
| Dashboard           | `GET /api/dashboard`              |

Les routes `POST` et `PATCH` doivent appeler des services métier qui valident les permissions et les règles de gestion. Il ne faut pas exposer directement les opérations Prisma au navigateur.

## 10. Les règles à ne jamais négliger

- Une réservation confirmée doit être protégée contre les conflits.
- Une sortie de matériel doit générer un mouvement de stock.
- Une réception fournisseur ne doit augmenter le stock qu'après validation de la réception.
- Un retour endommagé ne doit pas rendre automatiquement le matériel disponible.
- Un camion ne doit pas être affecté à deux missions incompatibles.
- Une modification importante doit être traçable.
- Les données de chaque agence doivent rester isolées.
- La 3D ne doit jamais afficher des statuts inventés ou prendre le pas sur les données enregistrées.

## 11. Le premier objectif concret

Ne commence pas par développer tous les modules en même temps. La première version doit déjà permettre ce parcours complet :

1. Créer un client.
2. Créer un événement avec ses dates et son lieu.
3. Ajouter le matériel nécessaire.
4. Vérifier les disponibilités et confirmer la réservation.
5. Préparer le matériel dans l'entrepôt.
6. Affecter un camion et une équipe.
7. Enregistrer le départ.
8. Enregistrer le retour et les éventuels dommages.
9. Libérer les quantités réellement revenues et utilisables.
10. Consulter le coût et la marge de l'événement.

La scène 3D sera branchée sur ce parcours : tu pourras cliquer sur le matériel, les emplacements ou les véhicules pour accéder aux mêmes opérations que dans les écrans de gestion classiques.

Mon conseil : développe d'abord ce parcours métier de bout en bout avec une scène 3D simple, puis améliore progressivement le réalisme graphique. C'est la meilleure façon d'obtenir un logiciel réellement utile à ton agence plutôt qu'un environnement 3D impressionnant mais difficile à exploiter.