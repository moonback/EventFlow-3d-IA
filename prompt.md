# MISSION PRINCIPALE — CRÉER UN ERP/CRM COMPLET POUR UNE AGENCE ÉVÉNEMENTIELLE AVEC INTERFACE 3D IMMERSIVE

Tu es un architecte logiciel senior, développeur full-stack expert, spécialiste des ERP/CRM, de la logistique événementielle, de PostgreSQL, de la sécurité informatique et de la 3D temps réel avec Three.js et React Three Fiber.

Ta mission est de **concevoir, développer, tester, documenter et préparer au déploiement une application complète et professionnelle**, nommée provisoirement **EventFlow 3D**.

Tu travailles directement dans le dépôt ouvert dans Claude Code. Tu dois créer les vrais fichiers, installer les dépendances nécessaires, exécuter les commandes, tester les fonctionnalités et corriger les erreurs rencontrées.

## 1. RÈGLES DE TRAVAIL OBLIGATOIRES

- Ne te limite jamais à expliquer ce qu'il faudrait faire : implémente réellement les fonctionnalités.
- Commence par inspecter le dépôt, les fichiers existants, les outils disponibles et l'environnement.
- Si le projet est vide, initialise-le. S'il existe déjà, conserve et améliore ce qui est pertinent.
- Prends des décisions techniques raisonnables sans me poser une question à chaque étape.
- Si une information métier manque, choisis une valeur par défaut configurable et documente ton choix.
- Avance par étapes cohérentes et vérifiables.
- Après chaque étape importante, lance les contrôles adaptés : lint, vérification TypeScript, tests et build.
- Corrige les erreurs avant de poursuivre lorsque cela est possible.
- Ne prétends jamais qu'une fonctionnalité est terminée si elle est seulement simulée, visuelle ou non testée.
- N'utilise pas de faux boutons qui ne font rien, de pages vides, de liens cassés ou de données fictives dans les parcours de production.
- Tu peux utiliser des données de démonstration uniquement dans un seed ou un mode démo clairement identifié.
- N'expose jamais les secrets, mots de passe, clés API ou variables privées dans le navigateur, les journaux ou le dépôt Git.
- N'effectue aucune opération payante, publication publique, suppression irréversible de données ou action externe engageante sans autorisation explicite.
- Ne désactive pas les contrôles de sécurité pour faire passer les tests.
- N'ajoute pas de microservices ou d'infrastructure inutilement complexe.
- Si une dépendance ou un service externe est indisponible, construis une intégration proprement isolée et explique ce qui reste à configurer.
- Si tu atteins une limite de contexte, écris l'état d'avancement, les décisions prises, les fichiers modifiés, les tests exécutés et les prochaines tâches dans `PROGRESS.md`, puis continue à partir de ce fichier.
- Ne t'arrête pas après avoir créé le squelette initial. Continue jusqu'à ce que les principaux parcours métier soient implémentés et vérifiés.

## 2. OBJECTIF DU LOGICIEL

Créer un logiciel de gestion tout-en-un destiné à une agence événementielle généraliste.

L'agence peut organiser :
- Des mariages et événements privés.
- Des événements d'entreprise.
- Des salons et foires.
- Des concerts et spectacles.
- Des conférences et séminaires.
- Des festivals.
- Des événements sportifs.
- Des lancements de produits.
- Des événements associatifs et institutionnels.

Elle possède du matériel événementiel varié, un entrepôt, des véhicules, des collaborateurs et des clients.

Le catalogue initial contiendra moins de 500 références, mais l'architecture doit pouvoir évoluer.

Le logiciel doit réunir un ERP, un CRM, un outil de planification, un gestionnaire de stock, un outil de logistique et une interface 3D immersive.

L'interface doit être moderne, premium, professionnelle, fluide, intuitive et visuellement impressionnante, avec un univers 3D interactif inspiré des jeux de gestion et de simulation.

La 3D doit servir à piloter les opérations réelles, et non à être uniquement décorative.

## 3. TECHNOLOGIES À UTILISER

Utilise les versions stables et mutuellement compatibles au moment du développement.

- Next.js avec App Router.
- TypeScript en mode strict.
- React.
- Tailwind CSS.
- shadcn/ui pour les composants classiques.
- Three.js.
- React Three Fiber.
- Drei pour les utilitaires 3D.
- PostgreSQL comme base de données.
- Prisma ORM.
- Auth.js ou une solution d'authentification maintenue et compatible.
- Zod pour valider les entrées.
- React Hook Form pour les formulaires.
- Une bibliothèque de tableaux adaptée aux données métier, par exemple TanStack Table.
- Une solution graphique adaptée aux statistiques, par exemple Recharts.
- Vitest pour les tests unitaires et d'intégration.
- Playwright pour les tests de parcours utilisateur.
- Un stockage S3 compatible pour les fichiers en production, avec une abstraction permettant un stockage local en développement.
- Docker Compose pour faciliter le lancement local de PostgreSQL et des services nécessaires.

Utilise npm sauf si le dépôt existant utilise déjà un autre gestionnaire de paquets.

Évite les dépendances redondantes. Vérifie la compatibilité entre les versions installées et la documentation officielle.

L'architecture doit être un **monolithe modulaire**, facile à maintenir, tester et déployer.

## 4. ARCHITECTURE GÉNÉRALE

Organise l'application par domaines métier.

Structure indicative :

- `src/app/`
  - `(auth)/login`
  - `(auth)/forgot-password`
  - `(auth)/reset-password`
  - `(workspace)/dashboard`
  - `(workspace)/world`
  - `(workspace)/warehouse`
  - `(workspace)/inventory`
  - `(workspace)/events`
  - `(workspace)/planning`
  - `(workspace)/customers`
  - `(workspace)/suppliers`
  - `(workspace)/quotes`
  - `(workspace)/invoices`
  - `(workspace)/finance`
  - `(workspace)/logistics`
  - `(workspace)/vehicles`
  - `(workspace)/team`
  - `(workspace)/maintenance`
  - `(workspace)/documents`
  - `(workspace)/reports`
  - `(workspace)/settings`
  - `api/`
- `src/components/`
  - `ui/`
  - `layout/`
  - `forms/`
  - `tables/`
  - `charts/`
  - `feedback/`
- `src/features/`
  - `auth/`
  - `customers/`
  - `events/`
  - `inventory/`
  - `reservations/`
  - `warehouse/`
  - `logistics/`
  - `vehicles/`
  - `staff/`
  - `quotes/`
  - `invoices/`
  - `finance/`
  - `suppliers/`
  - `maintenance/`
  - `documents/`
  - `reports/`
- `src/three/`
  - `scenes/`
  - `objects/`
  - `interactions/`
  - `materials/`
  - `loaders/`
  - `ui/`
- `src/server/`
  - `services/`
  - `repositories/`
  - `permissions/`
  - `validators/`
  - `jobs/`
- `src/lib/`
- `prisma/`
- `tests/`
- `public/models/`
- `public/textures/`
- `docs/`

Adapte cette structure si cela améliore réellement le projet, mais garde une séparation nette entre interface, logique métier, accès aux données et 3D.

## 5. DESIGN ET EXPÉRIENCE UTILISATEUR

Créer une interface de logiciel professionnel haut de gamme.

Direction artistique :
- Interface sombre élégante, avec thème clair optionnel.
- Gris anthracite, noir bleuté et surfaces neutres.
- Couleurs d'accent sobres et configurables.
- Typographie lisible.
- Icônes cohérentes.
- Cartes et tableaux bien espacés.
- Animations courtes et discrètes.
- États de chargement, erreurs, succès et absence de données soignés.
- Interface responsive pour ordinateur, tablette et mobile.
- Accessibilité : navigation clavier, libellés, contrastes et retours de validation.

Ne transforme pas chaque écran en jeu vidéo. Les formulaires, tableaux financiers et documents doivent rester rapides à utiliser.

La 3D constitue un mode de navigation et de pilotage complémentaire. Toutes les fonctionnalités essentielles doivent également être accessibles via des pages classiques.

Créer :
- Une barre de navigation latérale.
- Une barre supérieure avec recherche globale, notifications, profil et sélecteur d'organisation.
- Un tableau de bord personnalisable.
- Des panneaux contextuels.
- Des fenêtres de confirmation pour les actions importantes.
- Des filtres, tris, recherches et pagination pour les grandes listes.
- Des raccourcis clavier raisonnables.
- Des états vides avec des appels à l'action utiles.

## 6. UNIVERS 3D INTERACTIF

Créer un monde 3D navigable qui représente les espaces physiques et opérationnels de l'agence.

### Espace A : bureau de direction

Le bureau représente le centre de pilotage.

Éléments :
- Bureau et écrans.
- Tableau de bord 3D.
- Calendrier des événements.
- Indicateurs de chiffre d'affaires, coûts et marges.
- Tâches urgentes.
- Alertes de stock et de logistique.

En cliquant sur un élément, ouvrir le module correspondant.

### Espace B : entrepôt

Créer un entrepôt 3D comportant :
- Rayonnages.
- Zones de stockage.
- Emplacements identifiés.
- Matériel et catégories de matériel.
- Zones de préparation.
- Zones de retour.
- Zone de matériel endommagé ou en maintenance.

Les objets doivent correspondre à des emplacements ou ressources métier réels.

Un clic sur un rayonnage ouvre son contenu réel en base de données.

Un clic sur un matériel ouvre une fiche contextuelle avec :
- Nom.
- Référence.
- Photo.
- Quantité totale.
- Quantité disponible.
- Quantité réservée.
- Quantité en préparation.
- Quantité en transit.
- Quantité endommagée.
- Quantité en maintenance.
- Emplacement.
- Historique des mouvements.
- Actions autorisées.

Permettre de rechercher une référence et de mettre visuellement en évidence son emplacement.

### Espace C : zone logistique

Créer une zone de chargement comprenant :
- Quai.
- Zones de préparation.
- Véhicules.
- Chargements.
- Départs.
- Retours.

Les véhicules doivent afficher leur statut réel : disponible, affecté, en mission, en maintenance ou indisponible.

Un clic sur un véhicule ouvre ses caractéristiques, ses missions, sa capacité et ses éventuelles alertes.

### Espace D : événements

Créer un espace de suivi des événements, avec :
- Événements à préparer.
- Événements prêts à partir.
- Événements en cours.
- Événements terminés.
- Alertes et retards.

Cliquer sur un événement ouvre sa fiche détaillée.

### Espace E : centre de contrôle

Afficher :
- Planning.
- Occupation du stock.
- Véhicules mobilisés.
- Équipes affectées.
- Tâches en retard.
- Devis à relancer.
- Factures impayées.
- Alertes de maintenance.
- Indicateurs financiers.

### Exigences techniques de la 3D

- Utiliser React Three Fiber et Drei.
- Créer des composants 3D réutilisables.
- Utiliser des modèles GLB/GLTF optimisés lorsqu'ils sont disponibles.
- En l'absence de modèles, générer des scènes provisoires propres avec de la géométrie procédurale.
- Ne pas attendre la création de modèles externes pour rendre le projet fonctionnel.
- Ajouter une navigation intuitive : déplacement, rotation, zoom, sélection et retour à la vue générale.
- Ajouter un mode plan ou une vue simplifiée lorsque cela améliore la lisibilité.
- Prévoir un mode de secours sans WebGL.
- Charger les modèles à la demande.
- Optimiser les textures, les matériaux, les lumières et les objets.
- Éviter les scènes trop lourdes.
- Prévoir une interface 2D accessible pour toutes les opérations essentielles.

Chaque objet interactif doit avoir une identité stable et explicite, par exemple un type et un identifiant métier. Ne déduis jamais l'identité d'une ressource de sa position dans la scène.

Flux d'interaction obligatoire :

1. L'utilisateur sélectionne un objet.
2. L'application identifie son type et son identifiant.
3. Le serveur vérifie les droits de l'utilisateur.
4. Le serveur charge les données réelles.
5. L'interface affiche un panneau contextuel.
6. L'utilisateur choisit une action.
7. Le serveur valide les règles métier et la demande.
8. La base de données est mise à jour de manière transactionnelle.
9. La scène est rafraîchie uniquement après confirmation du serveur.

Aucune écriture métier ne doit être effectuée directement depuis le composant 3D vers la base de données.

## 7. AUTHENTIFICATION, ORGANISATIONS ET PERMISSIONS

Prévoir un système sécurisé avec :
- Connexion.
- Déconnexion.
- Réinitialisation de mot de passe.
- Sessions sécurisées.
- Gestion des comptes.
- Invitations si elles sont implémentées de façon sécurisée.
- Gestion des rôles.
- Gestion des organisations.
- Isolation stricte des données entre organisations.

Rôles de départ :
- Propriétaire.
- Administrateur.
- Direction.
- Responsable logistique.
- Gestionnaire de stock.
- Commercial.
- Comptabilité.
- Technicien.
- Chauffeur.
- Intermittent ou membre d'équipe.
- Lecture seule.

Créer une matrice de permissions explicite, configurable au niveau approprié.

Chaque opération sensible doit vérifier les permissions côté serveur.

Ne jamais considérer le masquage d'un bouton comme une mesure de sécurité.

Chaque requête doit être limitée à l'organisation autorisée de l'utilisateur. Ne jamais accepter aveuglément un identifiant d'organisation transmis par le navigateur.

Mettre en place des tests vérifiant qu'un utilisateur d'une organisation ne peut ni lire ni modifier les données d'une autre organisation.

Les changements de rôles et les opérations sensibles doivent être journalisés.

## 8. BASE DE DONNÉES ET MODÈLE MÉTIER

Conçois un schéma Prisma cohérent et complet, avec relations, contraintes, index et migrations.

Les modèles doivent au minimum couvrir les domaines suivants.

### Organisation et utilisateurs

- Organization
- User
- Membership
- Role ou système de permissions équivalent
- Invitation si nécessaire
- AuditLog
- Notification

### CRM

- Customer
- CustomerContact
- CustomerAddress
- Supplier
- SupplierContact

Un client peut être un particulier ou une entreprise.

Gérer les coordonnées, adresses de facturation, adresses d'événement, notes, historique commercial et documents associés.

Limiter les données personnelles au strict nécessaire et prévoir leur gestion conformément à la réglementation applicable.

### Événements

- Event
- EventType
- EventTask ou Task
- EventNote
- EventDocument
- EventStaffAssignment
- EventExpense

Chaque événement comporte notamment :
- Référence unique.
- Client.
- Type.
- Nom.
- Statut.
- Date et heure de début.
- Date et heure de fin.
- Adresse et lieu.
- Horaires de montage et démontage.
- Responsable.
- Budget prévisionnel.
- Coûts prévisionnels.
- Coûts réels.
- Notes.
- Documents.
- Matériel réservé.
- Véhicules affectés.
- Personnel affecté.
- Tâches.
- Historique des changements.

Gérer correctement les fuseaux horaires. Enregistrer les dates de façon cohérente et afficher l'heure locale de l'événement.

### Catalogue de matériel

- EquipmentProduct
- EquipmentCategory
- EquipmentAsset si le matériel est suivi individuellement
- StockLocation
- StockBalance
- StockMovement
- Reservation
- ReservationLine
- ReturnInspection
- MaintenanceTicket

Distinguer :
1. La référence catalogue, par exemple un projecteur.
2. La quantité disponible de cette référence.
3. Les unités individuelles identifiées par numéro de série lorsque nécessaire.

Le système doit fonctionner même si la majorité du matériel est gérée en quantité plutôt qu'à l'unité.

Catégories possibles :
- Sonorisation.
- Éclairage.
- Vidéo.
- Structure.
- Scène.
- Mobilier.
- Décoration.
- Électricité.
- Distribution électrique.
- Câblage.
- Signalétique.
- Tentes.
- Chauffage.
- Climatisation.
- Barrières.
- Accessoires.
- Consommables.
- Divers.

Chaque produit doit pouvoir avoir :
- Nom.
- Référence SKU unique dans son périmètre.
- Code-barres facultatif.
- Catégorie.
- Description.
- Photos.
- Unité.
- Quantité gérée en stock.
- Seuil d'alerte.
- Prix d'achat.
- Prix de location.
- Valeur de remplacement.
- Fournisseur principal.
- Dimensions et poids si pertinents.
- Statut actif ou archivé.

### Emplacements et stock

Un emplacement peut représenter :
- Un entrepôt.
- Une zone.
- Un rayonnage.
- Un emplacement de rayonnage.
- Une zone de préparation.
- Une zone de retour.
- Une zone de quarantaine.

Implémenter un historique de mouvements de stock :
- Réception fournisseur.
- Transfert.
- Réservation.
- Préparation.
- Sortie.
- Expédition.
- Retour.
- Retour endommagé.
- Mise en maintenance.
- Perte.
- Ajustement inventaire.

Chaque mouvement doit conserver une date, un motif, une quantité, les emplacements concernés, l'utilisateur responsable et une référence métier lorsque nécessaire.

Le journal des mouvements doit être traçable et ne pas pouvoir être modifié librement après validation. Les corrections passent par des mouvements compensatoires.

Les soldes sont maintenus de façon transactionnelle et réconciliables avec le journal.

### Réservations

- Reservation
- ReservationLine
- État du cycle de réservation.
- Fenêtre de disponibilité.
- Historique.
- Lien vers l'événement.

États possibles :
- Brouillon.
- En attente.
- Confirmée.
- En préparation.
- Préparée.
- Expédiée.
- Partiellement retournée.
- Retournée.
- Annulée.

Ne pas considérer une réservation brouillon ou annulée comme une réservation confirmée.

### Véhicules

- Vehicle
- VehicleAssignment
- VehicleMaintenance si nécessaire
- VehicleDocument
- VehicleExpense

Données :
- Immatriculation.
- Marque.
- Modèle.
- Type.
- Capacité de chargement en poids et volume si connue.
- Kilométrage.
- Statut.
- Contrôles et documents.
- Entretien.
- Disponibilités.
- Missions.
- Chauffeur.
- Coûts associés.

Prévenir les doubles affectations incompatibles et les dépassements de capacité lorsque les données sont disponibles.

### Personnel

- StaffMember ou modèle User étendu proprement.
- StaffAvailability.
- Skill.
- StaffSkill.
- EventStaffAssignment.
- Timesheet ou relevé d'heures si nécessaire.
- StaffDocument si nécessaire.

Gérer :
- Compétences.
- Disponibilités.
- Coordonnées nécessaires.
- Affectations.
- Horaires.
- Heures réalisées.
- Coût horaire ou coût de mission.
- Documents utiles.
- Statut actif ou inactif.

Évite de dupliquer inutilement les utilisateurs. Sépare clairement l'accès logiciel et le statut de collaborateur.

### Devis, commandes et factures

- Quote
- QuoteLine
- Invoice
- InvoiceLine si nécessaire
- Payment
- CreditNote si implémentée
- Document

Fonctions :
- Créer un devis.
- Modifier un devis en brouillon.
- Ajouter du matériel, de la main-d'œuvre, du transport et des prestations.
- Ajouter des remises.
- Calculer les totaux hors taxes, taxes et toutes taxes comprises.
- Gérer les taux de TVA configurables.
- Créer une version PDF.
- Envoyer un devis uniquement après action explicite.
- Suivre son statut.
- Transformer un devis accepté en réservation ou commande selon le workflow défini.
- Émettre une facture.
- Enregistrer les paiements.
- Calculer les soldes dus.
- Suivre les retards de paiement.
- Générer les justificatifs et exports utiles.

Prévoir une numérotation unique et sûre pour les documents commerciaux.

Une facture validée ne doit pas être modifiée silencieusement. Toute correction doit suivre une procédure documentée et conforme aux règles applicables.

Ne prétends pas que le logiciel est certifié fiscalement ou juridiquement sans preuve. Documente les validations réglementaires nécessaires avant sa mise en production en France.

### Achats et fournisseurs

- PurchaseOrder
- PurchaseOrderLine
- Supplier
- GoodsReceipt si nécessaire

Gérer :
- Demandes d'achat.
- Commandes fournisseurs.
- Réceptions.
- Quantités attendues et reçues.
- Coûts d'achat.
- Factures fournisseurs ou références associées.
- Mise à jour du stock après réception effective.

Une commande fournisseur ne doit pas augmenter le stock disponible avant la réception réelle.

### Finances et rentabilité

Créer les fonctionnalités de suivi de :
- Chiffre d'affaires prévisionnel.
- Chiffre d'affaires facturé.
- Paiements reçus.
- Créances.
- Dépenses.
- Achats.
- Coût de la main-d'œuvre.
- Coûts de transport.
- Coûts du matériel.
- Marge prévisionnelle.
- Marge réelle.
- Rentabilité par événement.
- Rentabilité par client.
- Rentabilité par période.

Documente clairement les formules de calcul.

Distingue les indicateurs opérationnels d'une véritable comptabilité générale. N'invente pas une conformité comptable.

### Objets 3D

Créer un modèle permettant de relier :
- Une scène.
- Un objet visuel.
- Un type d'objet métier.
- Un identifiant métier stable.
- Une position.
- Une rotation.
- Une échelle.
- Des métadonnées non sensibles.

Ne stocke pas arbitrairement des données métier critiques dans un champ JSON non validé.

## 9. RÈGLES MÉTIER CRITIQUES

Ces règles sont obligatoires.

### Disponibilité du stock

Calculer la disponibilité réelle sur une période, et pas seulement la quantité actuellement présente dans l'entrepôt.

Pour chaque produit, tenir compte :
- Du stock utilisable.
- Des réservations actives qui se chevauchent.
- Des dates et heures.
- Du temps de préparation.
- Du transport.
- Du retour.
- Du temps de contrôle après retour.
- Du matériel endommagé.
- Du matériel en maintenance.
- Des pertes et immobilisations.
- Des mouvements en cours selon leur statut.

Exemple : si l'agence possède 20 projecteurs et qu'un événement a besoin de 12 projecteurs, un second événement ne peut pas en réserver 10 sur une période qui se chevauche, sauf si une autre source de stock valide permet de couvrir le besoin.

La vérification de disponibilité et la confirmation de réservation doivent être protégées contre les accès concurrents. Deux utilisateurs ne doivent pas pouvoir confirmer simultanément des réservations qui dépassent le stock réel.

Utilise des transactions, des contraintes, des verrous ou un mécanisme de sérialisation adapté à PostgreSQL. Évite les solutions qui ne font qu'effectuer une vérification avant une écriture non protégée.

### Préparation et retours

- La préparation ne doit pas créer artificiellement du stock.
- La sortie de stock doit être tracée.
- Le retour doit enregistrer les quantités réellement rendues.
- Le matériel endommagé doit rester indisponible jusqu'à sa remise en état validée.
- Un retour partiel doit être possible.
- Les quantités attendues et les quantités réelles doivent être distinguées.
- Les anomalies doivent être signalées.
- Les écarts d'inventaire doivent être justifiés et tracés.

### Véhicules et équipes

- Empêcher les affectations incompatibles sur la même période.
- Vérifier les disponibilités.
- Vérifier les compétences exigées si elles sont renseignées.
- Vérifier les capacités des véhicules lorsque les données nécessaires sont présentes.
- Afficher les conflits et permettre leur résolution.

### Données et calculs

- Utiliser des types numériques adaptés pour les quantités et les montants.
- Utiliser Decimal pour les montants monétaires.
- Ne pas utiliser les nombres flottants JavaScript pour les calculs financiers critiques.
- Valider les données côté serveur.
- Normaliser et valider les entrées.
- Gérer les fuseaux horaires.
- Prévenir les doublons critiques.
- Utiliser des transactions pour les workflows impliquant plusieurs écritures.

## 10. FONCTIONNALITÉS ET ÉCRANS

### Tableau de bord

Afficher :
- Événements à venir.
- Préparations du jour.
- Retours attendus.
- Tâches en retard.
- Disponibilité du stock.
- Alertes de matériel.
- Véhicules mobilisés.
- Devis en attente.
- Factures impayées.
- Chiffre d'affaires prévisionnel.
- Marge prévisionnelle.
- Activité récente.

Les indicateurs doivent provenir des vraies données.

### Clients

Créer, consulter, modifier, rechercher, filtrer et archiver les clients.

Afficher :
- Coordonnées.
- Contacts.
- Adresses.
- Événements passés et futurs.
- Devis.
- Factures.
- Historique.
- Documents.
- Notes commerciales.

### Événements

Créer un événement avec un formulaire complet et une validation claire.

Gérer :
- Dates.
- Horaires.
- Lieu.
- Client.
- Matériel.
- Équipe.
- Véhicules.
- Tâches.
- Documents.
- Budget.
- Dépenses.
- Statut.
- Historique.

Ajouter une vue calendrier, une vue liste et une fiche événement.

### Catalogue et inventaire

Créer :
- Liste des références.
- Filtres par catégorie.
- Recherche.
- Fiche produit.
- Photos.
- Historique.
- État du stock.
- Mouvements.
- Inventaires.
- Import et export CSV.
- Alertes de seuil.
- Codes-barres si une intégration réaliste peut être mise en place.

Prévoir un import avec aperçu, validation, rapport d'erreurs et confirmation avant modification des données.

### Réservations

Créer :
- Création d'une réservation.
- Ajout de plusieurs références.
- Contrôle de disponibilité.
- Affichage des conflits.
- Confirmation sécurisée.
- Modification contrôlée.
- Annulation avec motif.
- Préparation.
- Expédition.
- Retours.
- Historique complet.

### Logistique

Créer une liste de préparation par événement :
- Référence.
- Quantité demandée.
- Quantité préparée.
- Quantité manquante.
- Emplacement.
- Responsable.
- Statut.

Créer des checklists de chargement et de déchargement.

### Véhicules

Créer :
- Liste.
- Fiches détaillées.
- Calendrier.
- Affectations.
- Entretien.
- Documents.
- Historique des missions.
- Alertes.

### Équipe

Créer :
- Liste des collaborateurs.
- Compétences.
- Disponibilités.
- Affectations.
- Calendrier.
- Conflits.
- Coûts.
- Temps réalisé si activé.

### Devis et factures

Créer une interface professionnelle avec lignes modifiables, calculs fiables, états de document, aperçu et export PDF.

### Rapports

Prévoir des rapports filtrables :
- Activité par période.
- Rentabilité des événements.
- Utilisation du matériel.
- État du stock.
- Matériel immobilisé.
- Performance commerciale.
- Retards de paiement.
- Coûts logistiques.
- Charge de travail.

Prévoir des exports CSV adaptés aux droits de l'utilisateur.

## 11. API ET SERVICES MÉTIER

Crée des services métier réutilisables, indépendants des composants visuels.

Exemples :
- `CustomerService`
- `EventService`
- `InventoryService`
- `ReservationService`
- `StockMovementService`
- `WarehousePreparationService`
- `ReturnService`
- `VehicleService`
- `StaffAssignmentService`
- `QuoteService`
- `InvoiceService`
- `PaymentService`
- `FinanceService`
- `SceneService`
- `ReportService`

Expose les opérations via les routes API adaptées au projet.

Exemples d'endpoints :
- `GET /api/customers`
- `POST /api/customers`
- `GET /api/events`
- `POST /api/events`
- `GET /api/inventory/products`
- `GET /api/inventory/availability`
- `POST /api/reservations`
- `POST /api/reservations/:id/confirm`
- `POST /api/preparations`
- `POST /api/returns`
- `POST /api/stock/movements`
- `GET /api/vehicles`
- `POST /api/vehicle-assignments`
- `GET /api/staff`
- `POST /api/staff-assignments`
- `GET /api/quotes`
- `POST /api/quotes`
- `POST /api/quotes/:id/issue`
- `POST /api/invoices`
- `POST /api/payments`
- `GET /api/scene`
- `GET /api/dashboard`
- `GET /api/reports`

Adapte les routes aux conventions Next.js et à la version installée.

Chaque endpoint doit :
- Authentifier l'utilisateur.
- Vérifier son organisation.
- Vérifier les permissions.
- Valider les entrées avec Zod.
- Appeler un service métier.
- Gérer les erreurs proprement.
- Retourner une réponse typée.
- Ne pas exposer de données privées inutiles.

Ne renvoie jamais directement des objets Prisma non filtrés au navigateur.

Utilise une pagination appropriée pour les collections volumineuses.

## 12. SÉCURITÉ

Mettre en œuvre :
- Contrôle d'accès serveur.
- Isolation des organisations.
- Validation des entrées.
- Protection contre les injections.
- Sessions sécurisées.
- Gestion sûre des mots de passe.
- Protection des routes sensibles.
- Limitation des tentatives de connexion si appropriée.
- Protection contre les abus et les accès non autorisés.
- Journalisation des opérations importantes.
- Politique de conservation des données documentée.
- Protection des téléchargements et pièces jointes.
- Validation des types et tailles de fichiers.
- Gestion des secrets via variables d'environnement.
- En-têtes de sécurité adaptés.
- Sauvegarde et procédure de restauration documentées.

Ne fais pas confiance aux identifiants ou permissions envoyés par le client.

Pour les téléversements, ne rends pas publics par défaut les documents clients, contrats, factures ou pièces confidentielles.

Prévois une procédure de sauvegarde PostgreSQL et une procédure de restauration testable.

## 13. NOTIFICATIONS ET AUTOMATISATIONS

Créer une infrastructure simple pour les notifications internes :
- Nouvelle réservation confirmée.
- Stock insuffisant.
- Préparation incomplète.
- Départ imminent.
- Retour en retard.
- Matériel endommagé.
- Entretien à effectuer.
- Devis à relancer.
- Facture en retard.
- Tâche en retard.

Prévoir des préférences de notification.

Les emails peuvent être intégrés via un fournisseur configurable. En développement, utiliser un adaptateur de test ou une boîte mail locale.

Ne prétends pas qu'un email a été envoyé si le fournisseur ne l'a pas confirmé.

Ne mets en place des tâches planifiées que si elles sont réellement nécessaires. Si elles sont ajoutées, documente comment elles fonctionnent en développement et en production.

## 14. IMPORTS, EXPORTS ET DOCUMENTS

Prévoir :
- Export CSV.
- Import CSV contrôlé.
- Génération PDF des devis.
- Génération PDF des factures.
- Bons de préparation.
- Bons de livraison.
- Fiches de retour.
- Rapports de stock.
- Documents liés aux événements.

Les PDF doivent avoir une mise en page professionnelle, des numéros de documents, les coordonnées nécessaires, les montants détaillés et les mentions configurables.

Ne jamais inclure de données d'une autre organisation.

Prévoir un aperçu avant téléchargement et gérer les erreurs de génération.

## 15. DONNÉES DE DÉMONSTRATION

Créer un seed facultatif et clairement documenté comprenant :
- Une organisation de démonstration.
- Des utilisateurs de test avec différents rôles.
- Des catégories de matériel.
- Une sélection de produits.
- Des emplacements d'entrepôt.
- Quelques véhicules.
- Des collaborateurs.
- Des clients.
- Des événements.
- Des réservations.
- Quelques devis et factures.
- Des tâches et notifications.

Ne pas créer de compte administrateur public avec un mot de passe connu dans un environnement de production.

Le seed doit être réexécutable de façon sûre et ne pas dupliquer les données à chaque lancement.

Séparer clairement les données de test des données de production.

## 16. TESTS OBLIGATOIRES

Écrire des tests unitaires, d'intégration et de parcours utilisateur.

Au minimum, vérifier :

1. Un utilisateur non authentifié ne peut pas accéder aux pages privées.
2. Un utilisateur ne peut pas accéder aux données d'une autre organisation.
3. Un utilisateur sans permission ne peut pas modifier le stock.
4. La création et la modification d'un client fonctionnent.
5. La création et la modification d'un événement fonctionnent.
6. Une réservation valide peut être créée.
7. Une réservation en conflit est refusée.
8. Deux demandes concurrentes ne peuvent pas sur-réserver le stock.
9. Les réservations annulées ne bloquent pas indéfiniment le stock.
10. Le retour partiel est correctement enregistré.
11. Le matériel endommagé n'est pas considéré comme disponible.
12. Les mouvements de stock sont traçables.
13. Une commande fournisseur ne crée pas de stock avant réception.
14. Les conflits de véhicules sont détectés.
15. Les conflits d'affectation du personnel sont détectés.
16. Les totaux d'un devis sont corrects.
17. Les montants utilisent une précision monétaire fiable.
18. Une facture validée ne peut pas être modifiée arbitrairement.
19. Les fichiers générés respectent l'organisation et les permissions.
20. Les principales pages se chargent sans erreur.
21. Les principaux parcours fonctionnent dans un navigateur.
22. La scène 3D affiche les ressources renvoyées par le serveur.
23. Une erreur WebGL ne bloque pas l'accès aux fonctionnalités classiques.

Les tests doivent utiliser un environnement isolé et des données de test. Ne lance jamais de test destructif contre une base de production.

## 17. PERFORMANCES ET QUALITÉ

- Utiliser des composants serveur lorsque c'est pertinent.
- Réserver les composants client aux interactions nécessaires.
- Charger la scène 3D à la demande.
- Éviter d'importer Three.js dans toutes les pages.
- Mettre en place des états de chargement.
- Éviter les requêtes N+1.
- Ajouter les index SQL utiles.
- Limiter les champs renvoyés par les API.
- Utiliser la pagination.
- Optimiser les images.
- Éviter les rendus 3D inutiles.
- Prévoir une interface utilisable avec un matériel informatique standard.
- Garder une architecture testable et lisible.
- Ne supprime pas les erreurs TypeScript avec des casts hasardeux ou `any` systématique.
- N'utilise pas de données codées en dur pour simuler le fonctionnement réel des modules finalisés.

## 18. CONFIGURATION ET DÉPLOIEMENT

Créer :
- `.env.example`
- `.gitignore`
- `README.md`
- `PROGRESS.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/SECURITY.md`
- `docs/DEPLOYMENT.md`
- `docs/BUSINESS_RULES.md`
- `docs/TESTING.md`
- `docker-compose.yml` si adapté.

Documenter les variables d'environnement nécessaires, sans jamais inclure de vrais secrets.

Prévoir :
- Démarrage local.
- PostgreSQL local.
- Migrations.
- Seed de démonstration.
- Lancement du serveur.
- Lancement des tests.
- Build de production.
- Déploiement sur une plateforme compatible avec Next.js et PostgreSQL.
- Stockage des fichiers.
- Sauvegardes.
- Restauration.
- Gestion des migrations en production.
- Contrôles de santé et journalisation.

Ne lance pas automatiquement de migration destructive sur une base de données existante.

## 19. ORDRE DE DÉVELOPPEMENT

Respecte cet ordre, mais ne t'arrête pas à la fin du squelette.

### Phase 1 — Initialisation

- Inspecter le dépôt.
- Initialiser Next.js et TypeScript si nécessaire.
- Installer les dépendances.
- Configurer Tailwind et shadcn/ui.
- Configurer les scripts.
- Créer le README et le fichier de progression.

### Phase 2 — Base de données et sécurité

- Configurer PostgreSQL.
- Créer le schéma Prisma.
- Valider le schéma.
- Créer les migrations.
- Mettre en place l'authentification.
- Mettre en place les organisations et permissions.
- Ajouter les tests d'isolation des données.

### Phase 3 — Socle de l'application

- Créer la navigation.
- Créer le tableau de bord.
- Créer les composants partagés.
- Mettre en place les formulaires, tableaux, erreurs et notifications.
- Ajouter les données de démonstration.

### Phase 4 — CRM et événements

- Clients.
- Contacts.
- Événements.
- Calendrier.
- Tâches.
- Documents.

### Phase 5 — Stock et réservations

- Catalogue.
- Emplacements.
- Mouvements.
- Disponibilités par période.
- Réservations.
- Concurrence et prévention des sur-réservations.

### Phase 6 — Opérations logistiques

- Préparation.
- Sorties.
- Expédition.
- Retours partiels.
- Contrôle du matériel.
- Dommages.
- Maintenance.

### Phase 7 — Véhicules et personnel

- Parc automobile.
- Affectations.
- Compétences.
- Disponibilités.
- Conflits.
- Coûts.

### Phase 8 — Devis, factures et finances

- Devis.
- Lignes et taxes configurables.
- PDF.
- Factures.
- Paiements.
- Dépenses.
- Marges.
- Rapports.

### Phase 9 — Monde 3D

- Scène générale.
- Bureau.
- Entrepôt.
- Logistique.
- Centre de contrôle.
- Objets interactifs.
- Panneaux contextuels.
- Synchronisation avec les données réelles.
- Mode de secours 2D.

### Phase 10 — Finalisation

- Notifications.
- Imports et exports.
- Tests de bout en bout.
- Contrôle de sécurité.
- Optimisation.
- Documentation.
- Build final.
- Liste des éventuels points restant à configurer.

## 20. CRITÈRES D'ACCEPTATION FINAUX

Le projet ne doit pas être considéré comme terminé tant que les points applicables suivants ne sont pas vérifiés :

- L'application démarre selon la procédure documentée.
- La base de données est configurée et les migrations fonctionnent dans un environnement de test.
- L'authentification fonctionne.
- L'isolation entre organisations est testée.
- Les permissions sont vérifiées côté serveur.
- Le CRUD des clients et événements fonctionne.
- Le catalogue et les emplacements fonctionnent.
- La disponibilité du stock est calculée correctement.
- Les conflits de réservation sont gérés, y compris en concurrence.
- Les préparations, sorties et retours sont traçables.
- Le matériel endommagé reste indisponible.
- Les affectations des véhicules et du personnel sont contrôlées.
- Les devis, factures et paiements sont cohérents.
- Les calculs monétaires sont fiables.
- Les rapports s'appuient sur les données réelles.
- La scène 3D est interactive et reliée aux ressources métier.
- Les fonctionnalités essentielles restent accessibles sans 3D.
- Les principaux tests passent.
- Le lint, le contrôle TypeScript et le build passent, ou les blocages restants sont précisément documentés.
- La documentation de lancement et de déploiement est complète.
- Aucun secret n'est commité.
- Aucun bouton essentiel ne prétend exécuter une action qui n'est pas implémentée.

## 21. INSTRUCTIONS DE DÉMARRAGE IMMÉDIAT

Commence maintenant.

1. Inspecte le projet existant et l'environnement.
2. Identifie les contraintes et les dépendances disponibles.
3. Établis un plan d'exécution concis dans `PROGRESS.md`.
4. Crée ou adapte le projet.
5. Implémente immédiatement la première étape.
6. Exécute les commandes de validation disponibles.
7. Corrige les erreurs.
8. Continue vers les modules métier dans l'ordre défini.
9. Ne t'arrête pas après avoir présenté le plan.
10. À chaque étape, résume les fonctionnalités réellement implémentées, les tests exécutés et les prochaines tâches.

Si tu ne peux pas terminer l'ensemble en une seule session, laisse le dépôt dans un état cohérent et fonctionnel, mets à jour `PROGRESS.md`, puis poursuis les étapes restantes dans les sessions suivantes.

À la fin, fournis un bilan précis :
- Fonctionnalités réellement terminées.
- Fonctionnalités partiellement terminées.
- Tests réellement exécutés et résultats.
- Commandes pour démarrer le projet.
- Variables d'environnement à configurer.
- Étapes restantes pour une mise en production sûre.

**Priorité absolue : construire un véritable logiciel métier fiable, sécurisé et utilisable, avec une interface 3D immersive, et non une simple maquette visuelle.**