# Déploiement

> Ce document décrit une procédure ; il ne remplace pas une validation par l'équipe qui
> exploitera la plateforme. Aucune mise en production n'a été réalisée par ce projet.

## Prérequis

- Node.js 20 LTS ou 22, PostgreSQL 16 (managé de préférence, sauvegardes activées).
- Un proxy inverse HTTPS (Nginx, Caddy, load balancer…) qui termine TLS et **remplace**
  `X-Forwarded-For`.
- Un stockage S3 compatible (bucket privé) pour les fichiers, un relais SMTP authentifié.
- Un planificateur (cron, tâche planifiée de l'hébergeur) pour les alertes.

## Variables d'environnement (production)

| Variable | Obligatoire | Valeur |
|---|---|---|
| `NODE_ENV` | oui | `production` |
| `DATABASE_URL` | oui | URL PostgreSQL (utilisateur applicatif sans droits superutilisateur, `sslmode=require` si réseau) |
| `APP_URL` | oui | URL publique exacte, ex. `https://erp.mon-agence.fr` |
| `SESSION_TTL_HOURS` | non | 12 par défaut |
| `CRON_SECRET` | oui | `openssl rand -hex 32` |
| `MAIL_DRIVER` | oui | `smtp` (ou `disabled`) |
| `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` | si SMTP | paramètres du relais |
| `STORAGE_DRIVER` | oui | `s3` (le stockage local ne convient qu'à une instance unique avec disque persistant sauvegardé) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | si S3 | bucket **privé** (pas d'accès public : les fichiers sont servis par l'application après contrôle des droits) |
| `UPLOAD_MAX_MB` | non | 15 par défaut |
| `DEMO_PASSWORD`, `ALLOW_DEMO_SEED` | **non** | ne pas définir en production |
| `ASSISTANT_ENABLED` | non | `true` pour activer l'assistant vocal Eric (`false` par défaut) |
| `GEMINI_BACKEND` | si assistant | `enterprise` (Gemini Enterprise Agent Platform) — `developer` réservé aux essais |
| `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` | si assistant | projet Google Cloud ; région `eu` (résidence des données en Europe) |
| `GEMINI_LIVE_MODEL`, `GEMINI_LIVE_VOICE` | non | `gemini-3.8-live` par défaut ; voix prédéfinie optionnelle |
| `ASSISTANT_GATEWAY_PORT`, `ASSISTANT_MAX_SESSION_MINUTES`, `ASSISTANT_IDLE_SECONDS` | non | 3001, 30 min, 120 s par défaut |
| `NEXT_PUBLIC_ASSISTANT_WS_URL` | **non** | développement uniquement ; en production la passerelle est servie sur la même origine |

Les secrets sont fournis par le gestionnaire de secrets de l'hébergeur, jamais commités.

## Première installation

```bash
npm ci
npm run build
npm run db:deploy          # applique les migrations versionnées, sans réinitialisation
npm run start              # écoute sur le port 3000 (PORT=xxxx pour changer)
```

Premier compte : l'application ne crée **aucun** administrateur par défaut. Amorcer
l'organisation réelle et son propriétaire une seule fois :

```bash
ORG_NAME="Mon Agence" OWNER_EMAIL="direction@mon-agence.fr" OWNER_NAME="Prénom Nom" \
  APP_URL="https://erp.mon-agence.fr" npm run org:create
```

Le script crée l'organisation, ses emplacements système et le compte propriétaire **sans mot
de passe**, puis affiche un lien de définition du mot de passe à usage unique (24 h) à
transmettre par un canal sûr. Les autres membres sont ensuite invités depuis
« Paramètres → Membres ». Il refuse de s'exécuter si l'organisation existe déjà.

Ne **jamais** exécuter `npm run db:seed` en production : il crée des données de démonstration
(il refuse d'ailleurs de s'exécuter si `NODE_ENV=production`).

## Assistant vocal Eric (optionnel)

L'assistant passe par une **passerelle WebSocket** distincte de Next.js (`npm run assistant:gateway`,
port `ASSISTANT_GATEWAY_PORT`), car l'App Router ne gère pas l'upgrade WebSocket. Elle partage la
base et le code des services, authentifie l'utilisateur par le cookie de session et ouvre la session
Gemini Live avec les identifiants Google Cloud du serveur (jamais transmis au navigateur).

1. Google Cloud : API Vertex AI / Agent Platform activée, compte de service avec le seul rôle
   « Vertex AI User » attaché à l'hôte (ou `GOOGLE_APPLICATION_CREDENTIALS` vers un fichier monté
   hors du dépôt). Vérifier avec `npm run assistant:check` (un échange de quelques secondes).
2. Lancer la passerelle comme un second service (même image, même variables d'environnement).
   `ASSISTANT_ENABLED` indique seulement que la passerelle est installée : chaque organisation
   active ou désactive ensuite Eric dans **Paramètres → Organisation → Assistant vocal Eric**
   (activé par défaut), et y choisit la voix et la durée maximale d'une conversation (plafonnée
   par `ASSISTANT_MAX_SESSION_MINUTES`). Ces réglages nécessitent la migration
   `20261014170000_assistant_settings` (`npm run db:deploy`).
3. Proxy inverse : router `/ws/assistant` vers la passerelle **sur la même origine** que
   l'application, avec l'upgrade WebSocket et des délais longs, par exemple avec Nginx :

   ```nginx
   location /ws/assistant {
     proxy_pass http://127.0.0.1:3001;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
     proxy_set_header Host $host;
     proxy_read_timeout 3600s;
   }
   ```
4. Ne **pas** définir `NEXT_PUBLIC_ASSISTANT_WS_URL` au moment du build de production : la valeur
   serait figée dans le code client et ajoutée à la CSP.
5. Plusieurs instances de passerelle : une conversation reste attachée à sa connexion ; la limite
   « une conversation par utilisateur » est appliquée par instance.

## Mises à jour

1. Sauvegarde de la base (ci-dessous) ;
2. `npm ci && npm run build` ;
3. relire les nouvelles migrations (`prisma/migrations/*/migration.sql`), en particulier toute
   suppression de colonne ou de table ;
4. `npm run db:deploy` ;
5. redémarrage de l'application ; vérification `GET /api/health` (200 = application + base OK).

`prisma migrate reset` et `prisma db push` ne doivent jamais être utilisés sur une base de
production.

## Tâches planifiées

```cron
# Alertes (retards, départs imminents, échéances, stock bas…) et e-mails — toutes les 15 min
*/15 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://erp.mon-agence.fr/api/jobs/alerts
# Contrôle d'intégrité du stock (lecture seule, code retour 1 si écart) — chaque nuit
30 3 * * * cd /srv/eventflow && npm run -s stock:reconcile
```

Alternative sans HTTP : `npm run jobs:alerts` sur le serveur applicatif.

## Sauvegardes et restauration

```bash
# Sauvegarde quotidienne (format personnalisé, compressé)
pg_dump --format=custom --no-owner --file=backups/eventflow-$(date +%F).dump "$DATABASE_URL"

# Restauration dans une base VIDE (jamais par-dessus la production en service)
createdb eventflow_restore
pg_restore --no-owner --dbname=eventflow_restore backups/eventflow-AAAA-MM-JJ.dump
```

- Conserver plusieurs générations hors du serveur (rétention selon vos obligations).
- Sauvegarder aussi le bucket S3 (versionnage + réplication) : la base ne contient que les
  métadonnées des fichiers.
- **Tester une restauration** régulièrement (base de recette), puis `npm run stock:reconcile`
  sur la base restaurée.
- Les triggers (journal en ajout seul, factures immuables) sont restaurés avec le schéma.

## Exploitation

- Supervision : `GET /api/health` (sans donnée sensible) ; journaux applicatifs (erreurs).
- Plusieurs instances possibles : sessions et limitation des tentatives sont en base,
  numérotation et réservations protégées par verrous PostgreSQL ; utiliser S3 pour les fichiers.
- Docker Compose (`docker-compose.yml`) fournit PostgreSQL, Mailpit et MinIO **pour le
  développement uniquement**. Aucun Dockerfile applicatif n'est fourni à ce stade.
