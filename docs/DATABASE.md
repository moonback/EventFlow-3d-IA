# Base de données

PostgreSQL 16, schéma géré par Prisma (`prisma/schema.prisma`) et des migrations SQL versionnées
(`prisma/migrations`). Les migrations contiennent, en plus du DDL généré, des contraintes
`CHECK` et des triggers écrits à la main.

## Principes

- **Multi-organisation** : toutes les tables métier portent `organizationId` (index et clés
  uniques composées `organizationId + numéro/code`). L'organisation vient de la session.
- **Identifiants** : `cuid()` (non séquentiels, non devinables).
- **Montants** : `Decimal(12,2)` (taux `Decimal(5,2)`), jamais de flottants.
- **Dates** : `timestamptz` en UTC ; le fuseau de l'organisation (`Organization.timezone`)
  et celui de l'événement servent à la saisie et à l'affichage.
- **Suppression** : les entités référencées (clients, produits, véhicules…) sont archivées
  (`archivedAt`) plutôt que supprimées ; les clés étrangères critiques sont en `Restrict`.

## Modèles (60)

| Domaine | Modèles |
|---|---|
| Comptes | `Organization`, `User`, `Membership` (rôle, widgets du tableau de bord), `RolePermission` (surcharges), `Session`, `PasswordResetToken`, `LoginAttempt`, `Invitation`, `AuditLog` |
| Notifications | `Notification` (clé de déduplication), `NotificationPreference` |
| Numérotation | `DocumentSequence` (organisation × type × année) |
| CRM | `Customer`, `CustomerContact`, `CustomerAddress`, `Supplier`, `SupplierContact` |
| Événements | `EventType`, `Event`, `EventTask`, `EventNote` |
| Catalogue & stock | `EquipmentCategory`, `EquipmentProduct`, `EquipmentAsset` (unités sérialisées), `StockLocation` (arborescence), `StockBalance` (produit × emplacement), `StockMovement` (journal) |
| Réservations | `Reservation`, `ReservationLine` (quantités préparée/expédiée/retournée/endommagée/perdue), `ReservationHistory`, `ReturnInspection`, `ReturnInspectionLine` |
| Maintenance | `MaintenanceTicket` |
| Véhicules | `Vehicle`, `VehicleAssignment`, `VehicleMaintenance` |
| Personnel | `StaffMember`, `Skill`, `StaffSkill`, `StaffAvailability` (disponibilités / indisponibilités, `kind`), `EventStaffAssignment` (coût horaire figé, statuts `PROPOSED`/`DECLINED`, `respondedAt`, `declineReason`), `Timesheet`, `StaffPortalToken` (lien d'accès limité au portail, hash uniquement) |
| Pipeline | `Opportunity` (demande commerciale : étape, source, contact, besoin, probabilité, motif de perte) ; `Organization.publicRequestFormEnabled` ouvre le formulaire public |
| Commercial | `Quote`, `QuoteLine`, `Invoice` (facture ou avoir), `InvoiceLine`, `Payment`, `Expense` |
| Achats | `PurchaseOrder`, `PurchaseOrderLine`, `GoodsReceipt`, `GoodsReceiptLine` |
| Fichiers | `Document`, `ImportJob` |
| 3D | `SceneObject` (placement personnalisé d'un objet métier : type + identifiant métier) |

## Contraintes et triggers (migration `init` et suivantes)

| Objet | Règle |
|---|---|
| `StockBalance_quantity_nonneg` | Un solde ne peut pas devenir négatif |
| `StockMovement_quantity_pos`, `_has_location` | Quantité > 0 ; au moins une origine ou une destination |
| `ReservationLine_quantities` | `retourné + endommagé + perdu ≤ expédié`, toutes les quantités ≥ 0 |
| `MaintenanceTicket_quantities` | `réparé + mis au rebut ≤ quantité` |
| `PurchaseOrderLine_quantities` | `0 ≤ reçu ≤ commandé` |
| `*_period` | `endAt > startAt` (événements, réservations, affectations, indisponibilités) |
| `Payment_amount_pos` | Paiement > 0 |
| Trigger `StockMovement_append_only` | Le journal des mouvements refuse `UPDATE`/`DELETE` (correction = mouvement `REVERSAL`) |
| Trigger `Invoice_issued_immutable` | Une facture/avoir émis ne peut plus changer de numéro, client, dates, montants, snapshot de facturation, ni revenir en brouillon, ni être supprimé. Seuls le statut, l'encaissé et les notes évoluent |
| Trigger `InvoiceLine_issued_immutable` | Les lignes d'une facture émise sont figées |
| Migration `purge_guard` | Les deux protections ci-dessus acceptent une suppression uniquement si la variable de session `eventflow.allow_purge = 'on'` est positionnée dans la transaction — utilisé exclusivement par `purgeOrganization` (réinitialisation des organisations de démonstration) |

## Numérotation

`nextDocumentNumber` alloue un numéro par `INSERT … ON CONFLICT DO UPDATE … RETURNING` sur
`DocumentSequence`, dans la transaction métier : séquence continue (sans trou si la transaction
réussit, numéro libéré si elle échoue), sûre en concurrence, remise à zéro chaque année.
Formats : `DEV-2026-0001` (devis), `FAC-2026-00001` (factures, numéro attribué à l'émission),
`AV-2026-0001` (avoirs), `RES-…`, `EVT-…`, `MNT-…`, `CF-…` (commandes fournisseurs).

## Migrations

- Développement : `npm run db:migrate` (crée et applique une migration).
- Production : `npm run db:deploy` (`prisma migrate deploy`) applique uniquement les migrations
  versionnées, sans jamais réinitialiser la base. Les migrations destructives doivent être
  relues et précédées d'une sauvegarde (voir DEPLOYMENT.md).
- Contrôle d'intégrité du stock : `npm run stock:reconcile` recalcule les soldes à partir du
  journal et signale les écarts (lecture seule ; code de sortie 1 en cas d'écart).
