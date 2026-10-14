# 50 nouvelles fonctionnalités pour EventFlow 3D

_Analyse du 14 octobre 2026, à partir du code (`prisma/schema.prisma`, `src/server/services/*`,
`src/app/*`) et des documents existants._

## Point de départ

EventFlow 3D couvre déjà tout le cycle d'une agence événementielle : CRM, événements, catalogue
et stock, disponibilité sur une période, réservations sûres même en accès simultané, logistique,
maintenance, achats, véhicules, équipes, devis et factures, finance, rapports, notifications,
imports et exports, et un jumeau numérique 3D.

Ce document **complète** les documents existants sans les répéter :

- `Suggestion.md` : 50 idées pour le monde 3D (la plupart sont déjà réalisées) ;
- `ROADMAP.md` : grands chantiers (Factur-X, FEC, API publique, PWA hors ligne, copilote IA,
  IoT, portail client, place de marché, bilan carbone…).

Les 50 propositions ci-dessous portent surtout sur **le métier, au quotidien**. Elles comblent
des manques constatés dans le modèle de données. Par exemple, il n'existe aujourd'hui ni kit
de produits, ni pipeline commercial, ni caution, ni sous-location, ni fiche lieu réutilisable,
ni modèle d'événement.

Toutes respectent les principes du projet : contrôle côté serveur, isolation par
`organizationId`, journal d'audit, montants en `Decimal` et aucune promesse non tenue dans
l'interface.

**Légende**

- Effort : 🟢 faible · 🟡 moyen · 🔴 important
- ⭐ : fort impact métier
- 🔗 : prolonge un chantier de la roadmap (même thème, approche plus concrète)

---

## A. Commercial et CRM (1–9)

1. **Pipeline commercial (opportunités)** 🟡 ⭐
   Avant le devis, il y a la demande. Ajouter un modèle `Opportunity` avec les étapes
   Demande → Qualifiée → Devis envoyé → Gagnée / Perdue, un montant estimé, une probabilité et
   un motif de perte. Vue kanban par étape et prévision de CA pondérée sur le tableau de bord.
   *Où :* nouveau `opportunity-service.ts`. La conversion crée un `Event` en brouillon et un `Quote`.

2. **Formulaire de demande de devis public** 🟡 ⭐
   Une page publique par organisation (`/demande/[slug]`), intégrable sur le site de l'agence.
   Elle collecte la date, le lieu, le nombre d'invités, le type d'événement et le budget, puis
   crée une opportunité et notifie les commerciaux.
   Protection par limitation de débit (réutiliser `LoginAttempt` ou un équivalent) et piège à robots.

3. **Kits et packs de matériel** 🔴 ⭐
   Les clients louent rarement « 1 enceinte » : ils louent un « pack sono 200 personnes ».
   Ajouter `ProductKit` et `ProductKitItem` (composants et quantités). Un kit ajouté à un devis ou
   à une réservation se déplie en lignes. La disponibilité du kit est le minimum de la
   disponibilité de ses composants, divisée par leur quantité.
   *Où :* `availability-service.ts`, `quote-service.ts`, `reservation-service.ts`.

4. **Grilles tarifaires et tarifs dégressifs** 🟡 ⭐
   Aujourd'hui, une ligne vaut `quantité × jours × prix`. Ajouter des coefficients par durée
   (1 j = 1, 2 j = 1,5, semaine = 3…), des tarifs par client ou catégorie de clients (grands
   comptes, associations) et des périodes hautes ou basses. Le moteur de calcul `decimal.js`
   reste la seule source de vérité.

5. **Produits complémentaires suggérés** 🟢
   Lors de la saisie d'un devis, proposer « souvent loués avec » : câbles avec les enceintes,
   nappes avec les tables. La suggestion est calculée à partir des lignes de devis acceptés
   (cooccurrence simple, sans IA).

6. **Options et variantes dans un devis** 🟡
   Lignes optionnelles que le client coche ou décoche, et variantes (« Formule Essentiel /
   Premium ») dans un même devis. Le total est affiché par variante. À l'acceptation, seules les
   options retenues passent en réservation.

7. **Relances automatiques des devis** 🟢 ⭐
   Le job d'alertes signale déjà les devis à relancer. Aller plus loin avec une séquence
   d'e-mails paramétrable (J+3, J+7, J-2 avant expiration), arrêtée automatiquement dès que le
   devis change de statut. Chaque envoi est tracé dans l'historique du devis.

8. **Fiche client à 360° et score de valeur** 🟢
   CA cumulé, marge moyenne, délai de paiement moyen, nombre d'événements, taux de casse sur son
   matériel et dernier contact. Un client peut aussi recevoir une étiquette « à risque »
   (impayés, casse) qui s'affiche en avertissement à la création d'un devis.

9. **Journal des interactions client** 🟢
   Appels, rendez-vous, e-mails importants et prochaine action à faire, avec une date de rappel.
   Modèle `CustomerActivity` affiché sur la fiche client et dans les notifications.

## B. Préparation et conception des événements (10–17)

10. **Modèles d'événement** 🟡 ⭐
    Enregistrer un événement type (« Mariage 150 pers. ») avec ses tâches relatives (J-30,
    J-7…), son matériel, ses besoins en équipe et en véhicules. Créer un événement depuis un
    modèle prégénère tout, recalé sur la date choisie.
    *Où :* `EventTemplate`, réutilisant `EventType`.

11. **Fiches lieux réutilisables** 🟡 ⭐
    Les champs `venueName` et `addressLine1` sont aujourd'hui saisis à chaque événement. Créer un
    modèle `Venue` : accès, quai de déchargement, hauteur sous plafond, puissance électrique
    disponible, horaires de livraison, contacts, photos, plan et remarques des équipes. Une fois
    un lieu choisi, tout cela est connu.

12. **Contraintes techniques du lieu contrôlées** 🟡
    Une fois le lieu et le matériel connus, contrôler la puissance électrique totale (ajouter
    `powerW` au produit), le poids total suspendu et le gabarit des véhicules autorisés.
    Les dépassements apparaissent comme des avertissements dans la fiche événement.

13. **Conducteur (« run of show ») minute par minute** 🟡 ⭐
    Déroulé détaillé du jour J : horaires, séquences, responsables, besoins techniques par
    séquence. Exportable en PDF et consultable sur mobile par l'équipe.
    *Où :* `EventRunSheetItem`, PDF via `src/server/pdf`.

14. **Événements multi-jours et multi-sites** 🔴
    Un salon de 3 jours ou une tournée de 5 villes : ajouter des sous-événements (« sessions »)
    avec chacun leurs dates, leur lieu et leurs besoins, et une rentabilité consolidée sur
    l'événement parent.

15. **Gestion des invités et plan de table** 🔴
    Liste d'invités importée en CSV (réutiliser `import-service.ts`), régimes alimentaires,
    confirmations de présence, plan de table glisser-déposer. Le nombre d'invités confirmés
    met à jour `guestCount` et alerte si le matériel (chaises, couverts) devient insuffisant.

16. **Checklists qualité réutilisables** 🟢
    Listes de contrôle par type d'événement (sécurité, accessibilité PMR, extincteurs, issues de
    secours), cochées par l'équipe avec l'auteur et l'heure. Une checklist incomplète bloque le
    passage au statut « En cours » (bloquant ou non selon la configuration).

17. **Gestion des risques et plan B** 🟢
    Registre des risques par événement (météo, retard fournisseur, absence d'un technicien), avec
    probabilité, impact, mesure préventive et responsable. Affiché en résumé sur la fiche
    événement.

## C. Stock, matériel et entrepôt (18–27)

18. **Sous-location auprès de confrères** 🔴 ⭐
    Quand la disponibilité est insuffisante, proposer de sous-louer au lieu de refuser. Créer
    une « réservation entrante » chez un fournisseur. Le stock est temporaire : il entre à la
    réception et sort au retour au loueur, le coût est rattaché à l'événement, et la date de
    restitution est suivie.
    🔗 Préalable concret à la place de marché de la phase 5.

19. **Liste d'attente sur rupture** 🟢
    Si une réservation ne peut être confirmée (`409 INSUFFICIENT_AVAILABILITY`), la placer en
    attente. Dès qu'une annulation, un retour de maintenance ou une réception libère du stock,
    le commercial est notifié.

20. **Réservations provisoires (« options ») avec échéance** 🟡 ⭐
    Bloquer du matériel 72 h pour un client qui hésite, sans confirmer. L'option bloque la
    disponibilité et expire automatiquement via le job planifié. Le commercial est notifié
    avant l'expiration.
    *Où :* nouveau statut `OPTION` dans `ReservationStatus`, avec `expiresAt`.

21. **Contenants et flight-cases** 🟡
    Gérer les caisses comme des contenants : une caisse contient N unités sérialisées.
    Scanner la caisse revient à mouvementer tout son contenu, et un contenu incomplet est
    détecté au retour.
    *Où :* `parentAssetId` sur `EquipmentAsset`.

22. **Cycle de vie et amortissement des actifs** 🟡
    Date d'achat, durée d'amortissement, valeur nette comptable, nombre de sorties et CA généré
    par unité. Rapport de **rentabilité par référence** (CA de location ÷ prix d'achat) pour
    décider quoi racheter ou revendre.

23. **Maintenance préventive programmée** 🟢
    Contrôles périodiques par référence : par exemple un contrôle électrique tous les 12 mois ou
    une révision toutes les 50 sorties. Les tickets `MaintenanceTicket` sont générés
    automatiquement. Une unité dont le contrôle a expiré est bloquée à la préparation.

24. **Gestion des consommables et réapprovisionnement** 🟢
    Pour les produits `stockManaged` consommables (gaffer, piles, nappes jetables) : seuil,
    quantité de commande conseillée et **bon de commande fournisseur prérempli** depuis
    l'alerte de stock bas.
    *Où :* `purchase-service.ts`.

25. **Revente du matériel réformé** 🟢
    Le rebut sort aujourd'hui définitivement du stock. Ajouter un circuit de « revente
    d'occasion » : prix, acheteur, facture de vente. La valeur récupérée apparaît dans les
    rapports.

26. **Kits de préparation par vague (« wave picking »)** 🟡
    Regrouper les préparations de plusieurs réservations qui partent le même jour en une seule
    tournée de prélèvement dans l'entrepôt, triée par emplacement. Moins de trajets pour les
    magasiniers.

27. **Inventaire par écart de pesée et comptage aveugle** 🟢
    Mode « comptage aveugle » de l'inventaire : la quantité attendue est masquée au compteur,
    ce qui évite de recopier le chiffre affiché. L'écart est calculé côté serveur, avec une
    double validation au-delà d'un seuil.

## D. Logistique et transport (28–33)

28. **Bon de livraison signé par lien** 🟢 ⭐
    Un lien unique (jeton à usage limité, même mécanique que `PasswordResetToken`) envoyé au
    contact sur place. Il ouvre le bon, permet de signer au doigt et d'ajouter des photos ou
    des réserves, et rattache le PDF horodaté à la réservation.
    🔗 Version légère, sans application mobile, de la signature électronique de la phase 2.

29. **Créneaux de livraison et de reprise** 🟢
    Réserver un créneau sur le lieu (« livraison 7 h–8 h, quai B ») et sur le quai de l'agence
    au départ, pour éviter deux camions au même quai à la même heure. Les conflits sont
    contrôlés comme pour les véhicules.

30. **Transporteurs externes** 🟡
    Quand la flotte ne suffit pas, affecter un transporteur externe (fournisseur) avec son prix,
    son numéro de suivi et ses documents. Le coût est intégré au calcul « Transport » de la
    rentabilité.

31. **Feuille de route chauffeur** 🟢
    PDF ou page mobile par chauffeur et par jour : arrêts dans l'ordre, adresses, contacts,
    horaires, matériel à livrer ou reprendre, et lien d'itinéraire. Générée à partir de
    `VehicleAssignment` et des réservations.

32. **Suivi carburant, péages et kilomètres réels** 🟢
    Saisie des pleins et du kilométrage au retour. Le coût réel du transport remplace
    l'estimation, et la consommation par véhicule est suivie avec une alerte en cas de dérive.

33. **Gestion des incidents de transport** 🟢
    Déclarer un accident, une panne, une amende ou un retard, avec photos, et le rattacher au
    véhicule, au chauffeur et à l'événement. Les amendes peuvent être réaffectées au
    collaborateur concerné selon la politique interne.

## E. Équipes et ressources humaines (34–39)

34. **Portail freelance et intermittents** 🟡 ⭐
    Les intermittents et freelances reçoivent une proposition de mission, l'acceptent ou la
    refusent en ligne et déclarent leurs disponibilités. L'affectation n'est confirmée qu'après
    acceptation.
    *Où :* jeton d'accès limité, réutilisant `EventStaffAssignment` et `StaffAvailability`.
    🔗 Première brique concrète du portail prestataires (phase 5).

35. **Documents obligatoires et habilitations avec échéances** 🟢 ⭐
    Habilitation électrique, CACES, travail en hauteur, SST, visite médicale : date
    d'expiration et justificatif. Une affectation est refusée si la compétence requise a
    expiré, en étendant la règle actuelle `SCHEDULE_CONFLICT`. Une alerte part 30 jours avant
    l'échéance.

36. **Respect des temps de travail et de repos** 🟡
    Contrôle des amplitudes à l'affectation et au relevé d'heures : durée maximale par jour,
    repos minimal entre deux missions, heures de nuit. Les seuils sont paramétrables par
    organisation et affichés en avertissement, avec un blocage optionnel.

37. **Export préparatoire de paie** 🟢
    Export par période et par collaborateur des heures normales, de nuit et de dimanche, des
    paniers repas et des déplacements, au format CSV (sécurisé contre l'injection de formules
    comme les exports actuels). Destiné au gestionnaire de paie.

38. **Notes de frais des équipes** 🟢
    Le collaborateur saisit une dépense (repas, parking) avec sa photo de justificatif. Après
    validation par le responsable, elle devient une `Expense` rattachée à l'événement.

39. **Évaluation après mission** 🟢
    Après l'événement, le chef de projet évalue la mission de chaque intervenant : fiabilité,
    compétences, commentaire. L'historique est consultable lors des futures affectations et
    réservé aux rôles autorisés.

## F. Finance et facturation (40–44)

40. **Cautions et dépôts de garantie** 🟡 ⭐
    Caution demandée à la réservation, encaissée ou en empreinte, puis restituée, totalement
    ou partiellement, après le contrôle de retour. En cas de casse ou de perte, une retenue est
    calculée automatiquement à partir de la `replacementValue`.

41. **Facturation automatique de la casse et des pertes** 🟢 ⭐
    Les retours endommagés et les pertes sont déjà enregistrés. Proposer en un clic une facture
    complémentaire (ou une retenue sur caution) avec les lignes préremplies : références,
    quantités, valeur de remplacement ou coût de réparation.

42. **Relances d'impayés graduées** 🟢
    Séquence de relances paramétrable sur les factures échues (courtoise, ferme, mise en
    demeure), avec calcul des pénalités de retard et de l'indemnité forfaitaire selon les
    paramètres de l'organisation. Chaque relance est tracée.

43. **Budget par poste et suivi des engagements** 🟡
    Ventiler le `budgetAmount` d'un événement par poste (matériel, personnel, transport,
    traiteur…) et comparer en temps réel le budget, les engagements (commandes, affectations)
    et le réel. Une alerte se déclenche quand un poste dépasse un seuil.

44. **Commissions des commerciaux** 🟢
    Règles de commission (pourcentage de la marge ou du CA, par commercial ou par type
    d'événement), calculées sur les factures encaissées. Rapport mensuel exportable.

## G. Pilotage, collaboration et productivité (45–50)

45. **Bilan d'après-événement** 🟢 ⭐
    À la clôture : écarts prévu / réel (rentabilité existante), incidents, casse, retours en
    retard, retour client et leçons apprises. Le bilan est enregistré et consultable depuis le
    modèle d'événement (n° 10) pour améliorer les suivants.

46. **Enquête de satisfaction client** 🟢
    Après l'événement, un e-mail avec un lien unique propose une note (NPS) et un commentaire.
    Les résultats alimentent la fiche client (n° 8) et un indicateur du tableau de bord.

47. **Commentaires et mentions sur toutes les fiches** 🟡
    Fil de discussion sur un événement, un devis, une réservation ou un ticket. Mentionner un
    collègue avec `@prénom` déclenche une notification.
    *Où :* généraliser `EventNote` en `Comment` polymorphe ; `notification-service.ts`.

48. **Automatisations sans code (« si… alors… »)** 🔴
    Règles par organisation, par exemple :
    - « quand un devis est accepté, créer la tâche “Réserver le traiteur” assignée au chef de
      projet » ;
    - « quand un retour est en retard de 24 h, prévenir le commercial ».

    Le moteur s'exécute côté serveur, chaque exécution est journalisée dans l'audit, et les
    déclencheurs sont limités aux transitions de statut existantes.

49. **Rapports planifiés par e-mail** 🟢
    S'abonner à l'un des 9 rapports existants (hebdomadaire, mensuel) et le recevoir en PDF ou
    en CSV, dans le respect des permissions de l'abonné au moment de l'envoi.
    *Où :* `report-service.ts`, job planifié.

50. **Assistant de démarrage et données d'exemple isolées** 🟢 ⭐
    Parcours guidé à la création d'une organisation : identité et mentions, TVA, emplacements,
    catégories, import du catalogue, invitation de l'équipe, premier événement. Une check-list
    de progression s'affiche sur le tableau de bord.
    🔗 Concrétise l'« Onboarding » prévu en phase 0.

---

## Priorités conseillées

| Ordre | Fonctionnalités | Pourquoi |
|---|---|---|
| **1. Gains rapides** (🟢 ⭐) | 7, 28, 35, 41, 45, 50 | S'appuient sur des données et des jobs existants : forte valeur pour peu d'effort |
| **2. Cœur du métier** | 3 (kits), 20 (options), 18 (sous-location), 40 (cautions), 4 (tarifs) | Comblent les manques les plus visibles face aux logiciels de location du marché |
| **3. Commercial** | 1, 2, 6, 8 | Transforment l'outil de production en outil de vente |
| **4. Organisation interne** | 10, 11, 13, 34, 47 | Réduisent la ressaisie et la coordination par téléphone ou messagerie |
| **5. Grands chantiers** | 14, 15, 48 | Fort potentiel, mais à cadrer avec des agences pilotes |

## Impacts techniques à anticiper

- **Moteur de disponibilité** (`availability-service.ts`) : les kits (3), les options (20), la
  sous-location (18) et les contenants (21) le modifient. Chaque évolution doit conserver la
  garantie « aucune sur-réservation » : verrous `FOR UPDATE` ordonnés et tests de concurrence
  existants à étendre.
- **Liens publics à jeton** (2, 28, 34, 46) : mutualiser une seule brique « jeton à portée
  limitée » (haché, expirant, à usage limité, audité) plutôt que quatre implémentations.
- **Job planifié** (`/api/jobs/alerts`) : il absorbe les échéances (7, 20, 23, 35, 42, 49).
  Il faudra peut-être le découper en tâches distinctes avec suivi d'exécution.
- **Permissions** : chaque module ajoute ses permissions à la matrice `src/lib/permissions.ts`,
  avec des valeurs par défaut prudentes pour les 11 rôles.
- **Monde 3D** : plusieurs fonctionnalités ont une représentation naturelle (options en
  couleur atténuée sur les rayonnages, caisses-contenants, créneaux de quai), toujours en
  lecture seule, les actions passant par les API.
