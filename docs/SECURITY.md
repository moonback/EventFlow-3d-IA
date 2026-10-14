# Sécurité

## Authentification

- Mots de passe hachés en **Argon2id** (19 Mio, 2 itérations) ; politique : 10 caractères
  minimum, minuscule, majuscule et chiffre.
- **Sessions serveur** : jeton aléatoire de 256 bits remis dans le cookie `ef_session`
  (`HttpOnly`, `SameSite=Lax`, `Secure` en production) ; seule son empreinte SHA-256 est
  stockée. Durée `SESSION_TTL_HOURS` (12 h par défaut). Déconnexion = suppression serveur.
- **Limitation des tentatives** : 5 échecs par e-mail ou 30 par IP sur 15 minutes (stocké en
  base, valable avec plusieurs instances). Message d'erreur identique que le compte existe ou non.
- **Mot de passe oublié** : jeton à usage unique haché, valable 1 h ; la réponse ne révèle pas
  si l'adresse existe ; la réinitialisation révoque toutes les sessions de l'utilisateur. Le
  changement de mot de passe révoque les autres sessions.
- **Invitations** : jeton haché, valable 7 jours, rôle fixé par l'administrateur.
- Comptes et appartenances désactivables (`isActive`) : effet immédiat à la requête suivante.

## Autorisation

- 11 rôles (propriétaire, admin, direction, logistique, stock, commercial, comptabilité,
  technicien, chauffeur, équipe, lecture seule) × 45 permissions (`src/lib/permissions.ts`),
  surchargeables par organisation (écran « Permissions », réservé à `members:manage`). Le
  propriétaire conserve toujours toutes les permissions (pas de verrouillage accidentel).
- **Contrôle systématique côté serveur** : `pageContext(...)` pour les pages (redirection
  `/forbidden`), `apiHandler` + `assertCan` dans chaque service. Masquer un bouton n'est qu'un
  confort d'interface.
- **Isolation multi-organisation** : l'organisation active vient de la session (changement
  d'organisation vérifié par l'appartenance). Chaque requête Prisma filtre `organizationId` ;
  les identifiants transmis par le client sont toujours revérifiés dans l'organisation. Une
  ressource d'une autre organisation renvoie 404 (pas de fuite d'existence).
- **Page d'accueil** (`/`) : publique et statique (présentation du produit). Elle ne lit que la
  présence du cookie de session pour proposer « Ouvrir mon espace » ; aucune donnée d'organisation
  n'y est chargée. Le middleware l'autorise par correspondance exacte du chemin.
- **Portail prestataires** (`/portal`, `/api/portal/*`) : accès sans compte par un jeton
  limité (`StaffPortalToken`) — 256 bits aléatoires, seul le hash SHA-256 est stocké, validité
  30 jours, révocable (fiche collaborateur), invalide si le collaborateur est désactivé. Le jeton
  ne donne accès qu'aux missions et disponibilités d'**un** collaborateur d'**une** organisation
  (`PortalContext`, jamais un `AuthContext`) ; aucun coût n'est exposé. Côté API, il voyage dans
  l'en-tête `X-Portal-Token` (jamais dans l'URL), réponses `Cache-Control: no-store`, contrôle
  d'origine identique à `apiHandler`. La page est servie en `Referrer-Policy: no-referrer` et
  `noindex`. Erreur volontairement générique (« Lien invalide ou expiré »). Les actions sont
  auditées sans acteur (`actorId = null`). Couvert par `tests/integration/staff-portal.test.ts`.
- Documents : lecture soumise à `documents:read` **et** à la permission de l'entité de
  rattachement (client, événement, véhicule, personnel). PDF générés : mêmes contrôles que la
  ressource source. Couvert par `tests/integration/documents.test.ts`.

## Protection des requêtes

- **CSRF** : cookie `SameSite=Lax` + vérification de l'en-tête `Origin` (doit correspondre à
  `APP_URL` ou à l'hôte) pour toute requête API qui modifie des données.
- **Validation** : toutes les entrées passent par des schémas Zod (corps et paramètres) ;
  erreurs renvoyées par champ, sans trace interne.
- **SQL** : Prisma et requêtes brutes paramétrées (`$queryRaw` à gabarit) uniquement.
- **XSS** : rendu React (échappement), aucune insertion HTML brute ; CSP stricte.
- **En-têtes** : CSP (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`),
  `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS en
  production. Les réponses API sont `no-store` et peuvent seulement être encadrées par la même
  origine (aperçu PDF). Seule exception : le formulaire public `/demande/[slug]`
  (`frame-ancestors *`, sans `X-Frame-Options`) pour être intégré sur le site de l'agence ; il
  n'utilise aucune session.
- **Formulaire public de demande de devis** : fermé par défaut, limité à 5 envois par IP et 30
  par organisation par heure, piège à robots et délai minimal de saisie, contrôle d'origine sur
  l'API, réponse identique pour un robot détecté. Aucune donnée interne exposée (nom de
  l'organisation et types d'événement seulement).
- **Fichiers** : taille maximale (`UPLOAD_MAX_MB`), type déterminé par les **octets magiques**
  (et non l'extension ou le type déclaré), liste blanche (PDF, images, DOCX, XLSX, CSV, TXT),
  nom nettoyé, clé de stockage aléatoire préfixée par l'organisation, garde contre la traversée
  de chemin en stockage local. Téléchargement en `Content-Disposition: attachment` (aperçu
  `inline` limité aux PDF et images).
- **CSV** : neutralisation des formules (`=`, `+`, `-`, `@`) dans les exports.
- **Tâches planifiées** : `POST /api/jobs/alerts` exige `Authorization: Bearer $CRON_SECRET`
  (comparaison à temps constant) ; désactivé si la variable est vide.

## Secrets et données

- Variables d'environnement lues uniquement côté serveur (`src/lib/env.ts` marqué
  `server-only`, validation Zod au démarrage). Aucune variable `NEXT_PUBLIC_*` sensible.
- `.env` est ignoré par Git ; `.env.example` ne contient aucun secret réel ; `.env.test` ne
  contient que des valeurs de test locales.
- Les journaux n'enregistrent ni mots de passe, ni jetons, ni contenu de fichiers. Prisma ne
  journalise pas les requêtes en production.
- **Journal d'audit** (`AuditLog`) consultable par `audit:read` : permissions, membres,
  paramètres, documents, factures, paiements, mouvements de stock, réservations, etc.
- Données de démonstration : uniquement via le seed, dans des organisations marquées « démo »,
  refusé en production sauf `ALLOW_DEMO_SEED=true`, mot de passe fourni par `DEMO_PASSWORD`
  (aucun mot de passe connu dans le code).

## Points d'attention pour la production

- Placer l'application derrière un proxy inverse HTTPS qui **remplace** l'en-tête
  `X-Forwarded-For` (sinon la limitation par IP peut être contournée ; la limitation par
  e-mail reste effective).
- Définir `APP_URL` sur l'URL publique exacte (contrôle d'origine, liens des e-mails).
- La CSP autorise `'unsafe-inline'` pour les scripts (scripts d'hydratation Next.js) ; une CSP
  à nonce via le middleware renforcerait encore la protection.
- Pas d'authentification multifacteur ni de SSO à ce stade.
- Prévoir une revue de sécurité indépendante et un test d'intrusion avant mise en service.
