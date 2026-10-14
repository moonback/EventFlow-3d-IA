# Roadmap — EventFlow 3D, l'ERP événementiel du futur

> Ce document décrit une **vision et une feuille de route**, pas des engagements. Les horizons
> sont indicatifs et seront revus à chaque fin de phase, en fonction des retours clients. L'état
> réel du logiciel aujourd'hui est décrit dans [PROGRESS.md](PROGRESS.md).

## Vision

**Aujourd'hui**, un ERP enregistre ce qui s'est passé. **Demain**, EventFlow 3D anticipe ce qui
va se passer et propose quoi faire.

Nous voulons que chaque agence événementielle dispose d'un **jumeau numérique vivant** de son
activité. Il voit en temps réel où se trouve chaque caisse, chaque camion et chaque
technicien. Il prévoit les conflits avant qu'ils n'arrivent. Il chiffre un événement à partir
d'un simple brief. Il guide les équipes sur le terrain, même sans réseau.

Cinq convictions guident cette roadmap :

1. **Le terrain d'abord.** Un ERP événementiel vit dans les entrepôts, les camions et les salles,
   pas seulement dans les bureaux. Mobile, hors ligne, scan et signature sont essentiels.
2. **L'IA qui assiste, l'humain qui décide.** Toute suggestion d'IA est expliquée, modifiable et
   validée par une personne. Aucune écriture automatique sans règle métier ni confirmation.
3. **La 3D au service de la décision.** Le monde 3D sert à comprendre une situation en un coup
   d'œil et à agir plus vite. Ce n'est pas une vitrine.
4. **Confiance par conception.** Sécurité, isolation des données, traçabilité et conformité
   passent avant toute nouvelle fonctionnalité.
5. **Ouvert par défaut.** API publique, webhooks et intégrations : l'ERP s'insère dans
   l'écosystème de l'agence au lieu de l'enfermer.

## Vue d'ensemble

| Phase | Thème | Horizon indicatif | Résultat attendu |
|---|---|---|---|
| **0** | Prêt pour la production | 0 – 3 mois | Premiers clients réels en toute sécurité |
| **1** | Socle professionnel | 3 – 9 mois | Conformité, intégrations, API publique |
| **2** | Terrain connecté | 6 – 12 mois | Application mobile hors ligne, scan, signatures |
| **3** | Intelligence opérationnelle | 9 – 18 mois | Copilote IA, prévisions, optimisation |
| **4** | Jumeau numérique vivant | 12 – 24 mois | IoT, traçage en temps réel, 3D collaborative, AR/VR |
| **5** | Écosystème ouvert | 18 – 36 mois | Portail client, place de marché de sous-location, RSE |

```
Phase 0 ──▶ Phase 1 ──┬──▶ Phase 3 ──┐
                      └──▶ Phase 2 ──┴──▶ Phase 4 ──▶ Phase 5
```

---

## Phase 0 — Prêt pour la production

*Objectif : mettre le produit actuel entre les mains de premiers clients, sans risque.*

| Priorité | Chantier | Détail |
|---|---|---|
| 🔴 Indispensable | Conteneurisation | Dockerfile multi-étapes, image minimale non root, validation de `docker-compose.yml` |
| 🔴 Indispensable | Intégration continue | Pipeline lint, typecheck, tests d'intégration et E2E avec PostgreSQL de service, analyse des dépendances |
| 🔴 Indispensable | Pilotes réels | Validation SMTP (délivrabilité, SPF/DKIM) et S3 (bucket privé, versionnage) |
| 🔴 Indispensable | Sauvegardes | `pg_dump` automatisé, sauvegarde du stockage, **restauration testée** chaque mois |
| 🔴 Indispensable | Supervision | Journaux structurés, suivi des erreurs, métriques, alertes sur `/api/health` |
| 🔴 Indispensable | Revue externe | Test d'intrusion, validation juridique et comptable de la facturation et du RGPD |
| 🟠 Important | Sécurité renforcée | MFA (TOTP + clés d'accès/passkeys), CSP à nonce, rotation des sessions |
| 🟠 Important | Performance | Tests de charge (≥ 10 000 références, ≥ 1 000 événements par an), index et pagination vérifiés |
| 🟡 Souhaitable | Onboarding | Assistant de première configuration (emplacements, catégories, import du catalogue) |

**Critère de sortie** : deux agences pilotes utilisent l'outil au quotidien pendant un mois, sans
incident de données.

---

## Phase 1 — Socle professionnel

*Objectif : couvrir les obligations et les intégrations qu'attend une agence établie.*

### Conformité et finance
- **Facturation électronique** : émission et réception au format Factur-X / UBL via une
  plateforme agréée, pour suivre la réforme française de la facturation électronique. Le
  calendrier et les obligations exactes sont à confirmer avec un expert au lancement du chantier.
- **Export comptable** : FEC, écritures de ventes et d'achats, connecteurs vers les principaux
  logiciels comptables.
- **Multi-devises et multi-taxes** pour les événements à l'étranger, avec taux de change
  historisés.
- **Acomptes et échéanciers** : facturation par jalons (signature, J-30, solde).
- **Paiement en ligne** des factures (lien de paiement sécurisé, rapprochement automatique).
- **Rapprochement bancaire** assisté (import des relevés, suggestions de lettrage).

### Ouverture
- **API publique REST** documentée (OpenAPI), clés d'API par organisation avec permissions
  limitées et journalisées.
- **Webhooks** signés (réservation confirmée, facture émise, retour en retard…).
- **Synchronisation des calendriers** (Google, Microsoft 365) pour les équipes et les véhicules.
- **SSO d'entreprise** (OIDC/SAML) et provisionnement des comptes (SCIM).

### Expérience
- **Éditeur de modèles** PDF (devis, factures, bons) à la marque de l'agence.
- **Internationalisation** de l'interface (anglais, espagnol, allemand).
- **Champs personnalisés** par organisation sur les clients, événements et produits.
- **Vues enregistrées** : filtres, colonnes et tris mémorisés et partageables.

**Indicateurs** : temps de clôture mensuelle comptable divisé par 2 ; 0 ressaisie entre l'ERP
et la comptabilité.

---

## Phase 2 — Terrain connecté

*Objectif : que chaque technicien, magasinier et chauffeur ait l'ERP dans la poche.*

- **Application mobile PWA hors ligne** : préparation, chargement, livraison et retour sans
  réseau, synchronisation avec gestion des conflits au retour de la connexion.
- **Scan partout** : QR codes et codes-barres par caméra, impression d'étiquettes, douchettes
  Bluetooth ; une unité sérialisée scannée retrouve son historique complet.
- **Checklists guidées** de préparation et de chargement : ordre de chargement optimisé par
  camion, signalement immédiat des manquants.
- **Signature électronique** des bons de livraison et de retour par le client sur place, avec
  horodatage et photos.
- **États des lieux photographiques** : photos du matériel au départ et au retour, rattachées
  au ticket de maintenance en cas de casse.
- **Suivi des tournées** : position des véhicules (avec consentement), heure d'arrivée estimée
  partagée avec le client.
- **Feuilles de temps mobiles** : pointage sur site, pauses, frais, validation par le responsable.
- **Notifications push** : départ imminent, changement de planning, tâche assignée.

**Indicateurs** : écarts d'inventaire −50 % ; 100 % des retours contrôlés le jour même.

---

## Phase 3 — Intelligence opérationnelle

*Objectif : passer de l'enregistrement à l'anticipation et à la recommandation.*

### Copilote IA (assistant métier)
- **Du brief au devis** : à partir d'un e-mail ou d'un brief (« gala de 300 personnes, scène,
  sonorisation, éclairage d'ambiance »), le copilote propose un devis chiffré à partir du
  catalogue, des disponibilités réelles et des devis passés. L'utilisateur le relit et le valide.
- **Questions en langage naturel** : « Quels événements de juin perdent de l'argent ? »,
  « Où sont les 40 chaises pliantes manquantes ? ». Les réponses citent les données sources.
- **Résumés automatiques** : synthèse d'un événement, d'un client ou d'un mois d'activité.
- **Garde-fous** : l'IA ne voit que les données autorisées de l'utilisateur. Toute action
  proposée passe par les mêmes règles serveur et une confirmation explicite. Chaque suggestion
  est journalisée.

### Prévision et optimisation
- **Prévision de la demande** de matériel par saison et par type d'événement, avec
  recommandations d'achat ou de sous-location avant les pénuries.
- **Optimisation des tournées** : regroupement des livraisons, choix du véhicule selon le volume
  et le poids, réduction des kilomètres.
- **Affectation intelligente des équipes** : proposition de l'équipe idéale selon les
  compétences, la disponibilité, le coût et l'équité de la charge.
- **Tarification assistée** : prix suggérés selon la saison, le taux d'occupation du parc et
  l'historique de conversion des devis.
- **Maintenance prédictive** : détection des références qui reviennent souvent endommagées et
  planification préventive selon l'usage réel.
- **Détection d'anomalies** : retours incomplets récurrents, marges anormales, écarts de stock
  inhabituels.

**Indicateurs** : temps de création d'un devis −70 % ; taux d'utilisation du parc +20 % ;
ruptures de stock évitées.

---

## Phase 4 — Jumeau numérique vivant

*Objectif : que le monde 3D reflète la réalité en temps réel et serve à concevoir les événements.*

- **Traçage en temps réel** : portiques RFID/UHF aux quais, balises BLE sur les flight-cases.
  Les sorties et retours sont enregistrés automatiquement, avec validation humaine des écarts.
- **Capteurs IoT** : température et humidité des zones sensibles, chocs sur le matériel fragile,
  niveau de charge des batteries.
- **3D collaborative en temps réel** : plusieurs utilisateurs dans la même scène, curseurs
  partagés, annotations et commentaires sur les objets.
- **Conception d'événements en 3D** : import du plan du lieu client (PDF, DWG, IFC), implantation
  du matériel réservé à l'échelle, contrôle des surfaces, des charges et des circulations, export
  du plan d'implantation pour les équipes.
- **Simulation** : « Que se passe-t-il si ce camion a 2 h de retard ? » Projection de l'impact
  sur les préparations, les équipes et les autres événements.
- **Réalité augmentée** sur le terrain : pointer un rayonnage avec le téléphone pour afficher
  son contenu et la prochaine préparation, ou visualiser l'implantation sur le lieu réel.
- **Visite VR** de l'implantation finale avec le client avant l'événement.
- **Mode « salle de contrôle »** : écran mural le jour J (avancement des montages, véhicules en
  route, incidents ouverts).

**Indicateurs** : inventaires physiques annuels supprimés au profit du traçage continu ; temps de
conception d'une implantation divisé par 3.

---

## Phase 5 — Écosystème ouvert

*Objectif : connecter l'agence à ses clients, à ses partenaires et à ses engagements.*

- **Portail client** : suivi de l'événement, validation des devis et des plans, signature,
  paiement, téléchargement des documents, messagerie.
- **Portail prestataires et freelances** : disponibilités, missions, documents, factures.
  ✅ *Première brique livrée* : propositions de mission acceptées ou refusées en ligne,
  disponibilités déclarées, accès par lien limité (`/portal`). Suites : expiration et relance des
  propositions, relevés d'heures et dépôt de documents par le prestataire, suggestion des
  prestataires disponibles lors de l'affectation.
- **Place de marché de sous-location** entre agences : publication du matériel inutilisé,
  réservation inter-agences avec contrat et assurance, partage des revenus.
- **Bilan carbone et RSE** : émissions estimées par événement (transport, énergie, matériel),
  comparaison de scénarios, rapport client, suivi du réemploi et de la durée de vie du matériel.
- **Analyses avancées** : entrepôt de données, tableaux de bord personnalisables, comparaisons
  anonymisées entre agences (avec consentement explicite).
- **Extensions** : mécanisme de plugins et de connecteurs tiers (billetterie, CRM marketing,
  paie, assurance).

---

## Chantiers transverses (toutes phases)

| Chantier | Engagement |
|---|---|
| **Sécurité** | Revue à chaque phase, test d'intrusion annuel, programme de divulgation responsable, objectif de certification ISO 27001 |
| **Données personnelles** | Registre RGPD, durées de conservation paramétrables, export et effacement des données d'une personne, hébergement européen |
| **Fiabilité** | Objectifs de disponibilité mesurés, plan de reprise d'activité testé, migrations sans interruption |
| **Accessibilité** | Conformité WCAG 2.2 AA pour l'interface classique ; la 3D garde toujours une alternative 2D équivalente |
| **Performance** | Budgets de performance (temps de réponse, poids des pages, images par seconde en 3D) vérifiés en intégration continue |
| **Qualité** | Couverture de tests maintenue sur chaque règle métier, tests E2E sur chaque parcours critique, revue de code systématique |
| **Sobriété** | Rendu 3D à la demande, calculs IA mesurés et justifiés, hébergement à faible empreinte |

## Indicateurs de succès globaux

| Indicateur | Cible à 24 mois |
|---|---|
| Doubles réservations | 0 (garanti par le moteur de disponibilité) |
| Matériel perdu ou non retrouvé | −60 % |
| Temps de création d'un devis | −70 % |
| Taux d'utilisation du parc | +20 % |
| Délai d'encaissement moyen | −30 % |
| Satisfaction des utilisateurs terrain | ≥ 4,5 / 5 |

## Comment contribuer à la roadmap

- Proposer une idée ou un besoin en ouvrant une *issue* avec le contexte métier (qui, quand,
  pourquoi, combien de temps perdu aujourd'hui).
- Les priorités sont revues à chaque fin de phase selon trois critères : **valeur pour
  l'agence**, **risque réduit**, **effort**.
- Toute fonctionnalité doit respecter les principes du projet : contrôle côté serveur, isolation
  des organisations, traçabilité, précision monétaire, et aucune promesse non tenue dans
  l'interface.
