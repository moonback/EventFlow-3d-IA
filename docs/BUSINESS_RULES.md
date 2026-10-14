# Règles métier

Chaque règle est appliquée **côté serveur** (services + contraintes base). L'interface ne fait
que les refléter (aperçus de disponibilité, boutons désactivés).

## 1. Stock

- **Soldes** : `StockBalance` = quantité par produit × emplacement ; **journal** : `StockMovement`
  (ajout seul). Chaque mouvement met à jour les soldes dans la même transaction, par décrément
  conditionnel (`quantity >= n`) : un solde ne devient jamais négatif.
- **Types** : réception, transfert, préparation / annulation de préparation, expédition, retour,
  retour endommagé, entrée/sortie maintenance, perte, ajustements (+/−), contre-passation.
- **Correction** : un mouvement n'est jamais modifié ; on le contre-passe (`REVERSAL`, une seule
  fois par mouvement), ce qui recrée les soldes inverses s'ils sont disponibles.
- **Inventaire** : la saisie d'un comptage génère les ajustements d'écart (motif obligatoire).
- **Emplacements** : entrepôt, zone, rack, case, préparation, retour, quarantaine, maintenance,
  sortie (matériel chez le client). Les emplacements système sont créés par organisation.
- **Stock mobilisable (capacité)** = Σ soldes hors **quarantaine** et **maintenance** : le
  matériel endommagé ou en réparation n'est jamais proposé à la réservation.
- **Commande fournisseur** : n'ajoute **rien** au stock tant qu'elle n'est pas réceptionnée ;
  la réception (éventuellement partielle, `reçu ≤ commandé`) crée les mouvements `RECEIPT`.
- **Stock bas** : alerte quand le disponible immédiat passe sous le seuil du produit.
- Les produits « non suivis » (consommables, prestations) n'ont pas de contrôle de quantité.

## 2. Disponibilité sur une période

Pour un produit et une période `[début, fin)` :

```
disponible = capacité − pic des quantités bloquées simultanément sur la période
```

- Statuts **bloquants** : confirmée, en préparation, préparée, expédiée, partiellement retournée.
  **Non bloquants** : brouillon, en attente, retournée, annulée.
- Fenêtre bloquée par une réservation : `[début − tampon préparation, fin + tampon retour)`
  (tampons par réservation, valeurs par défaut de l'organisation).
- Après expédition, seule la quantité **encore dehors** bloque
  (`expédiée − retournée − endommagée − perdue`) ; si le retour est en retard, la fenêtre est
  prolongée jusqu'à `maintenant + tampon retour`.
- Le calcul utilise le **pic** (balayage d'intervalles semi-ouverts) et non la somme : deux
  réservations successives qui ne se chevauchent pas ne s'additionnent pas.

## 3. Réservations

Cycle : `Brouillon → (En attente) → Confirmée → En préparation → Préparée → Expédiée →
Partiellement retournée → Retournée`, annulation possible jusqu'à l'expédition.

- **Confirmation** : verrouille les lignes produit (`SELECT … FOR UPDATE`, ordre stable),
  recalcule la disponibilité dans la transaction et refuse (`409 INSUFFICIENT_AVAILABILITY`)
  si une ligne dépasse — deux confirmations simultanées ne peuvent pas sur-réserver.
- Une réservation n'est plus modifiable dès que la préparation a commencé.
- **Préparation** : prélèvement emplacement par emplacement vers la zone de préparation
  (jamais au-delà du restant à préparer) ; annulable (retour en rayon).
- **Expédition** : déplace le préparé vers « sortie » ; si la préparation est incomplète,
  l'expédition exige une confirmation explicite.
- **Retour** (partiel possible) : bon état → zone retour ; endommagé → **quarantaine** + ticket
  de maintenance automatique ; `retourné + endommagé + perdu ≤ expédié`.
- **Perte** : déclarée sur la quantité encore dehors, sort définitivement du stock.
- Un historique horodaté (`ReservationHistory`) trace chaque changement de statut.

## 4. Maintenance

Ticket créé à la main (envoi depuis un emplacement) ou automatiquement au retour endommagé.
Démarrage : quarantaine → atelier. Clôture partielle possible : réparé → emplacement choisi
(redevient disponible), rebut → sortie définitive (`réparé + rebut ≤ quantité`).

## 5. Véhicules et personnel

- Une affectation est refusée (`409 SCHEDULE_CONFLICT`) si, sur `[début, fin)` :
  véhicule déjà affecté, entretien planifié, véhicule hors service ; collaborateur déjà
  affecté, déjà chauffeur, indisponible déclaré, inactif ; compétence requise non détenue ;
  permis requis absent ; charge déclarée > charge utile / volume utile.
- Le véhicule (et le chauffeur) ou le collaborateur est verrouillé pendant le contrôle :
  deux affectations simultanées ne peuvent pas se chevaucher.
- Un aperçu des conflits est proposé avant validation (même code que le contrôle final).
- Le coût horaire est **figé** sur l'affectation ; les relevés d'heures alimentent le coût réel.

### Propositions de mission (portail prestataires)

- Une affectation peut être **proposée** (`PROPOSED`) au lieu d'être planifiée directement ;
  c'est le choix par défaut pour les freelances et intermittents. Cycle :
  `PROPOSED → CONFIRMED` (acceptée) | `DECLINED` (refusée, motif facultatif) | `CANCELLED` (retirée par la régie).
- **Seul le prestataire confirme** : la régie ne peut que retirer une proposition
  (`409 AWAITING_RESPONSE`) ; une mission refusée ne se réactive pas (`409 ASSIGNMENT_DECLINED`),
  on en propose une nouvelle.
- Une proposition en attente **bloque le créneau** comme une affectation ; une mission refusée
  le libère et sort des coûts prévisionnels, du taux d'occupation et de la scène 3D.
- À l'acceptation, le serveur revérifie sous verrou : événement non annulé (`EVENT_CANCELLED`),
  créneau toujours libre (`SCHEDULE_CONFLICT`). Une réponse déjà donnée renvoie
  `ASSIGNMENT_ALREADY_ANSWERED` (double clic, deux onglets).
- Aucun relevé d'heures sur une mission non acceptée (`ASSIGNMENT_NOT_CONFIRMED`).
- Chaque réponse notifie la logistique et la direction (`STAFF_MISSION_RESPONSE`) et est auditée.

### Disponibilités

- `StaffAvailability.kind` : `UNAVAILABLE` (bloque les affectations, comportement historique) ou
  `AVAILABLE` (disponibilité déclarée, indicative, jamais en conflit).
- Le prestataire saisit ses périodes depuis le portail et ne peut supprimer **que les siennes**
  (`declaredViaPortal`) ; le motif d'une indisponibilité saisie par la régie ne lui est pas montré.

## 6. Devis et factures

- **Ligne** : `quantité × jours × prix unitaire × (1 − remise %)`, arrondie au centime
  (arrondi commercial, demi vers le haut) — calcul en `decimal.js`.
- **Document** : remise globale appliquée, puis bases HT ventilées par taux de TVA, TVA par
  taux arrondie au centime, `TTC = HT + TVA`. Le dernier taux absorbe l'écart d'arrondi de la
  remise globale pour que `Σ bases = HT`.
- **Devis** : brouillon → envoyé (numéro attribué) → accepté / refusé / expiré / annulé. Une
  révision crée une nouvelle version (`DEV-2026-0001-V2`) et annule les versions non acceptées.
  L'acceptation confirme l'événement et génère une réservation **brouillon** des lignes matériel.
- **Facture** : numéro attribué **à l'émission** (séquence continue par an). Une facture émise
  est **immuable** (trigger base) ; la correction passe par un **avoir**, refusé à l'émission
  s'il dépasse le solde créditable de la facture d'origine.
- `Solde = TTC − encaissé − avoirs émis` ; statut payé / partiellement payé recalculé à chaque
  paiement (paiement > 0 et ≤ solde dû ; uniquement sur une facture émise non annulée).
- Le PDF reprend un **snapshot** des coordonnées client figé à l'émission.
- Mentions : pénalités de retard, pied de page et conditions sont paramétrables, mais leur
  conformité légale n'est **pas** garantie par le logiciel.

### Demandes de devis (formulaire public)

- Page publique `/demande/[slug]` par organisation, **fermée par défaut** : elle s'ouvre dans
  Paramètres › Organisation (permission `settings:manage`), qui fournit le lien et le code
  d'intégration iframe. Fermée ou inconnue, la page et l'envoi répondent « introuvable ».
- Champs : date (à venir, ≤ 5 ans), lieu, nombre d'invités (1 à 100 000), type d'événement
  (parmi ceux de l'organisation), budget facultatif, coordonnées et consentement obligatoire.
- Chaque demande crée une **opportunité** `DEM-AAAA-NNNN` au stade *Demande* (source
  *Formulaire public*) et notifie les rôles commerciaux (`QUOTE_REQUEST`). Un client existant est
  rapproché par e-mail ; **aucun client n'est créé** automatiquement depuis la page publique.
- Étapes : Demande → Qualifiée → Devis envoyé → Gagnée / Perdue. Une perte exige un motif ; la
  clôture fixe la probabilité (100 % / 0 %) et la date de clôture ; une réouverture les efface.
  Consultation `quotes:read`, suivi `quotes:write` ; le responsable doit être membre actif.
- Anti-abus : 5 demandes par IP et 30 par organisation par heure glissante (journal
  `LoginAttempt`, clé `quote-request:<organisation>`) ; piège à robots (champ masqué
  `website`) et délai minimal de saisie de 3 s — un robot détecté reçoit la même réponse qu'une
  demande acceptée, sans rien créer.

## 7. Rentabilité (indicateurs opérationnels, HT)

| Indicateur | Formule |
|---|---|
| CA prévisionnel | Σ devis acceptés de l'événement |
| CA facturé | Σ factures émises − Σ avoirs émis |
| Encaissé (TTC) | Σ paiements des factures de l'événement |
| Main-d'œuvre prévue | Σ affectations (durée × coût horaire figé) |
| Main-d'œuvre réalisée | Σ relevés d'heures × coût horaire de l'affectation |
| Transport | Σ affectations véhicule (jours entamés × coût/jour + km × coût/km) |
| Dépenses | Σ dépenses rattachées |
| Pertes matériel | Σ quantités perdues × valeur de remplacement |
| Coût prévu | coût estimé saisi, sinon MO prévue + transport + dépenses |
| Coût réel | MO réalisée (ou prévue sans relevé) + transport + dépenses + pertes |
| Marge prévue / réelle | CA prévisionnel − coût prévu / CA facturé − coût réel |

## 8. Numérotation

`DEV-AAAA-NNNN` (devis), `FAC-AAAA-NNNNN` (factures), `AV-AAAA-NNNN` (avoirs),
`RES-…`, `EVT-…`, `MNT-…`, `CF-…`, `DEM-…` (demandes) : séquence par organisation, type et année, allouée dans la
transaction métier (aucun doublon même en concurrence).

## 9. Notifications

Calculées par `POST /api/jobs/alerts` (ou `npm run jobs:alerts`), dédupliquées par jour :
retour en retard, départ imminent, préparation incomplète à moins de 24 h, facture échue,
devis à relancer, tâche en retard, échéance véhicule (entretien, contrôle, assurance), stock
bas. Envoi par e-mail selon les préférences de chaque utilisateur ; le statut affiché est celui
renvoyé par le fournisseur (`envoyé`, `stocké` en mode fichier, `désactivé`, `échec`) — un
e-mail n'est jamais présenté comme envoyé sans confirmation.

## 10. Imports / exports

- Import CSV (produits, clients) en deux temps : **aperçu** avec erreurs par ligne, puis
  application transactionnelle des seules lignes valides ; modèles téléchargeables.
- Exports CSV (séparateur `;`, BOM UTF-8) protégés contre l'injection de formules (`=`, `+`,
  `-`, `@` préfixés). Rapports et exports respectent les permissions du demandeur.
