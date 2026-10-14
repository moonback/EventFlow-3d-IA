# 50 suggestions pour le monde 3D d'EventFlow

Ces pistes partent de la scène actuelle :
- les **zones** Bureau, Entrepôt, Logistique, Événements et Centre de contrôle ;
- les **objets** rayonnages, aires au sol, véhicules, quais, pupitres d'événement et écrans d'indicateurs ;
- l'**architecture** existante : `src/three/*`, `scene-service.ts`, le mode agencement et le plan 2D de secours.

La règle actuelle reste valable pour toutes les suggestions : **la 3D n'écrit jamais en base**. Toute action passe par une route API qui revérifie les droits.

Légende : 🟢 effort faible · 🟡 effort moyen · 🔴 effort important · ⭐ fort impact métier

---

## A. Apparence et ambiance (1–10)

1. **Bâtiments avec murs, toit et coupe dynamique** ✅ *réalisée* 🟡
   Remplacer les murets de l'entrepôt par un vrai bâtiment : murs, bardage, portes sectionnelles côté quais. Quand la caméra descend, le toit devient transparent (*cut-away*), comme sur la maquette.
   *Où :* `objects/environment.tsx`, avec un `uniform` d'opacité piloté par la distance de la caméra.

2. **Sol extérieur réaliste** ✅ *réalisée* 🟢
   Asphalte avec marquages de parking, trottoirs, pelouse et arbres autour du site. Utiliser `InstancedMesh` pour les arbres et garder un seul *draw call*.

3. **Cycle jour / nuit lié à l'heure réelle** ✅ *réalisée* 🟡
   La lumière et le ciel suivent l'heure du fuseau de l'organisation. La nuit, les lampadaires, les vitres du bureau et les néons de l'entrepôt s'allument.

4. **Ombres douces et occlusion ambiante** ✅ *réalisée* 🟡
   Activer `shadows` avec `<AccumulativeShadows>` ou `<ContactShadows>` de drei, et éventuellement un SSAO léger. Prévoir un réglage « Qualité graphique » (bas / moyen / élevé) enregistré par utilisateur.

5. **Post-traitement « bloom » pour les états** ✅ *réalisée* 🟢
   Faire briller les colonnes des pupitres, les bandes de statut des véhicules et les alertes avec `@react-three/postprocessing`. Ne l'activer qu'en qualité élevée.

6. **Mobilier de bureau détaillé** ✅ *réalisée* 🟡
   Bureaux individuels avec écrans, chaises, plantes, salle de réunion vitrée avec table ovale, espace détente. Un bureau par collaborateur actif (module Équipe), avec son nom sur une plaque.

7. **Modèles GLTF optimisés pour les objets clés** ✅ *réalisée* 🔴
   Charger des modèles `.glb` compressés (Draco / Meshopt) pour les camions, chariots élévateurs, lyres et flight cases. Garder les formes procédurales actuelles comme repli et pour le niveau de détail éloigné.

8. **Thème clair / sombre de la scène** ✅ *réalisée* 🟢
   La scène suit le thème de l'application : couleur de fond, brouillard et grille. Aujourd'hui, le fond `#070a12` est codé en dur dans `world-scene.tsx`.

9. **Habillage aux couleurs de l'organisation** ✅ *réalisée* 🟢
   Logo et couleur de l'agence sur les camions, la façade et le sol de l'accueil. Les données viennent des paramètres de l'organisation.

10. **Niveaux de détail (LOD) automatiques** ✅ *réalisée* 🟡
    `<Detailed>` de drei : caisses individuelles de près, simple bloc coloré de loin. Les étiquettes sont masquées au-delà d'une certaine distance pour alléger la vue d'ensemble.

## B. Bureau de direction (11–17)

11. **Table de réunion « salle de crise »** ✅ *réalisée* 🟡 ⭐
    Une table ronde au centre du bureau. Cliquer dessus ouvre un mode réunion : les écrans affichent l'événement sélectionné (budget, équipe, matériel, tâches) et la caméra se place en vue assise.

12. **Écrans muraux interactifs** ✅ *réalisée* 🟡
    Les écrans d'indicateurs (`kpi-screen.tsx`) affichent de mini-graphiques (CA, marge) dessinés sur la texture canvas, et plus seulement des chiffres. Cliquer sur un écran ouvre directement la page 2D liée.

13. **Tableau blanc du planning de la semaine** ✅ *réalisée* 🟡 ⭐
    Un grand tableau mural qui affiche les 7 prochains jours sous forme de colonnes, avec les événements en post-it de couleur selon leur statut. Cliquer sur un post-it ouvre l'événement.

14. **Bureaux occupés / libres** ✅ *réalisée* 🟢
    Chaque poste montre si le collaborateur est en mission, en congé ou disponible, d'après ses affectations. Avatar en sphère colorée au-dessus de la chaise.

15. **Boîte aux lettres des devis** ✅ *réalisée* 🟢
    Un objet « courrier » sur le bureau commercial avec un compteur des devis à relancer. Il clignote doucement quand une relance est due.

16. **Coffre-fort / caisse des factures** ✅ *réalisée* 🟢
    Représentation visuelle des créances : une pile de dossiers rouges dont la hauteur suit le montant des factures en retard. Clic → `/invoices?overdue=true`.

17. **Mur des clients** 🟡
    Une galerie de logos des 10 meilleurs clients, avec un halo proportionnel au CA de l'année. Clic → fiche client.

## C. Entrepôt et stock (18–28)

18. **Recherche « GPS » d'une référence** ✅ *réalisée* 🟢 ⭐
    Quand on localise un matériel, une ligne lumineuse animée au sol relie l'entrée de l'entrepôt au rayonnage, avec un marqueur pulsant. La recherche existe déjà ; il manque le chemin visuel.

19. **Rayonnages à vraie capacité** 🟡
    Le nombre de niveaux et d'emplacements vient de la configuration de l'emplacement (aujourd'hui fixé à 3 × 4 dans `rack.tsx`). Survoler un niveau affiche son contenu.

20. **Caisses colorées par catégorie** 🟢
    La couleur des caisses suit la catégorie du matériel (son, lumière, mobilier…) au lieu du seul statut. Un bouton de légende permet de basculer entre « statut » et « catégorie ».

21. **Carte de chaleur des sorties** ✅ *réalisée* 🟡 ⭐
    Un calque au sol qui colore les rayonnages selon la fréquence de sortie sur 90 jours. Utile pour rapprocher le matériel le plus demandé de la zone de préparation.

22. **Préparation animée en direct** ✅ *réalisée* 🔴
    Quand une réservation est en préparation, des caisses quittent virtuellement le rayonnage vers l'aire de préparation au fil des lignes scannées. La progression vient de `quantityPrepared`.

23. **Chariots élévateurs et transpalettes** ✅ *réalisée* 🟢
    Engins décoratifs qui circulent sur des trajets prédéfinis entre rayonnages et quais, seulement quand l'activité du jour est non nulle. Désactivés si `prefers-reduced-motion` est actif.

24. **Inventaire tournant guidé** ✅ *réalisée* 🟡 ⭐
    Un mode « Comptage » qui surligne les emplacements à compter aujourd'hui et les met en vert une fois validés, en lien avec `/inventory/count`.

25. **Zone de quarantaine verrouillée** 🟢
    Ruban de sécurité, cage grillagée et panneau « Matériel bloqué » avec le nombre d'unités. Clic → liste des tickets de maintenance associés.

26. **Atelier de maintenance animé** 🟡
    Établi avec outils et le matériel en réparation posé dessus. Chaque ticket ouvert devient un objet, avec un sablier si la date prévue est dépassée.

27. **Alertes de stock bas en 3D** ✅ *réalisée* 🟢
    Un panneau d'avertissement flottant au-dessus des rayonnages qui contiennent une référence sous son seuil, avec la référence et la quantité restante.

28. **Vue « étagère » en gros plan** 🟡
    Double-clic sur un rayonnage : la caméra se met face à lui et chaque emplacement devient une case cliquable avec photo du produit, quantité et bouton de transfert.

## D. Logistique et véhicules (29–36)

29. **Chargement visuel des camions** ✅ *réalisée* 🟡 ⭐
    Ouvrir la caisse du camion pour voir son taux de remplissage : volume des réservations affectées comparé au `volumeM3` du véhicule. En rouge si c'est surchargé.

30. **Quais avec file d'attente** 🟢
    Chaque quai affiche le prochain départ (heure, événement, véhicule) sur un écran au-dessus de la porte.

31. **Véhicules en mission sur une mini-carte** ✅ *réalisée* 🔴
    Un écran « carte de France » dans la zone logistique qui place les véhicules en mission sur la ville de l'événement. Plus tard, position GPS réelle si un boîtier est connecté.

32. **Départ et retour animés** 🟢
    Quand un véhicule passe en mission, il sort par la route ; au retour, il revient se garer à quai. L'animation se joue au chargement si le statut a changé depuis la dernière visite.

33. **Alertes réglementaires sur les véhicules** ✅ *réalisée* 🟢 ⭐
    Une icône au-dessus du véhicule pour un contrôle technique, une assurance ou une révision proches de l'échéance. Ces alertes existent déjà dans `scene-service.ts`, mais ne sont pas visibles en 3D.

34. **Chauffeur assigné visible** 🟢
    Un avatar avec les initiales du chauffeur dans la cabine. Un véhicule sans chauffeur sur une mission prochaine est signalé en orange.

35. **Simulation de tournée** ✅ *réalisée* 🔴
    Pour un événement, montrer l'ordre de chargement des caisses (dernier chargé = premier déchargé) avec une animation pas à pas, et exporter cet ordre dans la fiche de chargement PDF.

36. **Parking du personnel et badges** 🟢
    Petite zone décorative de parking, avec un compteur des équipiers sur site aujourd'hui (affectations en cours).

## E. Zone Événements (37–42)

37. **Maquette miniature de chaque événement** ✅ *réalisée* 🔴 ⭐
    Remplacer le pupitre par une mini-scène selon le type d'événement : scène avec truss pour un concert, tables rondes pour un mariage, stands pour un salon. Taille proportionnelle au nombre d'invités.

38. **Frise temporelle au sol** ✅ *réalisée* 🟡 ⭐
    Disposer les événements sur une ligne du temps (passé → aujourd'hui → 60 jours) au lieu des colonnes actuelles, avec un curseur « aujourd'hui » lumineux. Faire défiler la frise fait voyager la caméra dans le temps.

39. **Compte à rebours au-dessus des pupitres** ✅ *réalisée* 🟢
    « J-3 », « Demain », « En cours » directement dans l'étiquette, avec un code couleur cohérent avec les statuts.

40. **Checklist de préparation flottante** 🟡
    Au survol d'un événement, un panneau montre les étapes : devis accepté, réservation confirmée, matériel préparé, véhicule affecté, équipe complète. Les étapes manquantes sont en rouge.

41. **Liens visuels événement ↔ ressources** ✅ *réalisée* 🟡 ⭐
    En sélectionnant un événement, des arcs lumineux le relient à ses rayonnages (matériel réservé), à ses véhicules et aux bureaux des équipiers affectés. C'est très parlant pour comprendre les dépendances.

42. **Météo du lieu pour les événements extérieurs** 🟡
    Icône météo au-dessus des événements en plein air dans les 7 prochains jours, via une API météo appelée côté serveur. Vigilance pluie ou vent pour les tentes et structures.

## F. Centre de contrôle et supervision (43–45)

43. **Mode « mur d'écrans » plein écran** ✅ *réalisée* 🟢 ⭐
    Une vue dédiée à afficher sur une TV de l'agence : rotation automatique de la caméra entre les zones toutes les 30 s, rafraîchissement automatique des données, aucun contrôle visible.

44. **Gyrophare d'alerte global** 🟢
    Au centre de contrôle, un gyrophare tourne et passe à l'orange ou au rouge selon le niveau d'alerte global. Le panneau « État du site » de l'accueil pourrait utiliser le même calcul.

45. **Journal d'activité en direct** 🟡
    Un bandeau défilant (*ticker*) sur un écran courbe qui reprend les dernières entrées du journal d'audit, mis à jour en temps réel (SSE ou interrogation périodique).

## G. Interaction, navigation et collaboration (46–50)

46. **Visite à la première personne** ✅ *réalisée* 🟡
    Le bouton « piéton » de la barre de commandes passe en vue à hauteur d'homme, avec déplacement clavier (ZQSD / flèches) et collisions simples. Pratique pour les présentations client.

47. **Signets de caméra et liens partageables** ✅ *réalisée* 🟢
    Enregistrer des points de vue (« Quai 2 », « Rayonnage B ») et partager un lien qui rouvre la scène sur ce point de vue. Les paramètres `?focus=` et `?zone=` existent déjà ; il faut ajouter la position de la caméra.

48. **Présence des collègues en temps réel** ✅ *réalisée* 🔴
    Voir les avatars des autres utilisateurs connectés et ce qu'ils regardent dans la scène, comme dans un outil collaboratif. Utile pendant les réunions de préparation à distance.

49. **Agencement avancé** ✅ *réalisée* 🟡
    Améliorer le mode « Agencer » existant :
    - rotation au clavier (R) ;
    - aimantation à la grille ;
    - duplication d'un rayonnage ;
    - annulation (Ctrl+Z) ;
    - historique des versions du plan, avec retour arrière.

50. **Accessibilité et performances de la 3D** ✅ *réalisée* 🟡 ⭐
    - Navigation clavier entre objets (Tab / Entrée), annonce vocale de l'objet sélectionné, contraste des étiquettes.
    - Rendu adaptatif (`<AdaptiveDpr>`, `<PerformanceMonitor>`) pour les petits portables.
    - Test e2e qui vérifie un temps de rendu initial maximal.

---

## Priorités conseillées

| Ordre | Suggestions | Pourquoi |
|------|-------------|----------|
| 1 | 18, 27, 33, 39, 43 | Rapides à faire et directement utiles au quotidien |
| 2 | 13, 24, 29, 41, 21 | Transforment la 3D en vrai outil de pilotage |
| 3 | 1, 4, 6, 10, 50 | Rendu professionnel tout en restant fluide |
| 4 | 37, 38, 46, 49 | Effet démo pour les clients et l'équipe |
| 5 | 7, 22, 31, 35, 48 | Chantiers lourds à planifier |
