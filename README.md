# GER Esport Manager

Application de gestion de tournois et d'équipes esport.
**Stack :** Next.js 14 (App Router) · TypeScript strict · Tailwind + shadcn/ui · PostgreSQL · Prisma · NextAuth.

## Démarrage

```bash
# 1. Installer les dépendances
npm install

# 2. Lancer PostgreSQL (Docker)
npm run db:up

# 3. Copier les variables d'environnement
cp .env.example .env   # (déjà présent en local)

# 4. Créer le schéma en base + client Prisma
npm run db:push

# 5. Seed : admin initial + pool de maps + réglages globaux
npm run db:seed

# 6. Démarrer le serveur de dev
npm run dev
```

L'app tourne sur http://localhost:3000

## Comptes

- **Admin initial** : défini par `ADMIN_EMAIL` / `ADMIN_PASSWORD` dans `.env` (créé par le seed).
- **Capitaines** : inscription libre via `/register` (crée le compte + son équipe).

## Scripts utiles

| Commande | Rôle |
|---|---|
| `npm run db:up` / `db:down` | Démarre / arrête PostgreSQL (Docker) |
| `npm run db:push` | Applique le schéma Prisma en base |
| `npm run db:migrate` | Crée une migration versionnée |
| `npm run db:seed` | Insère l'admin + maps + réglages |
| `npm run db:studio` | Ouvre Prisma Studio |

## Avancement des modules

- [x] **0. Init + DB + Auth** — schéma Prisma, NextAuth (email/mot de passe), rôles Admin/Capitaine, création d'admins
- [x] **1. Espace Équipe & gestion des joueurs** — CRUD joueurs + limite, profil public (classement/historique), réglage global admin
- [x] **2. Planning & propositions de match** — disponibilités, logique de conflit, propositions accept/refus, notifications
- [x] **3. Mapban temps réel (Match Room)** — lien unique, veto tour par tour BO1/BO3/BO5 via SSE, récap decider
- [x] **4. Résultats** — chaque équipe saisit manuellement le score et les stats de **ses propres
      joueurs uniquement** (screenshot optionnel, à titre de preuve). **Validation admin absolue** :
      la confirmation des capitaines est informative, seul un admin finalise un résultat. L'analyse
      IA via screenshots existe mais est désactivée par défaut (voir `AI_RESULT_ANALYSIS_ENABLED`)
- [x] **5. Leaderboard** — classement équipes (points/V-D) + individuel (TOP KILLER)
- [x] **6. Administration des matchs** — vue de tous les matchs (annuler/supprimer), minimum de joueurs
      requis pour jouer (réglage global)
- [x] **7. Double soumission + arbitrage admin** — chaque équipe peut soumettre sa propre version du
      résultat, comparées côte à côte ; l'admin peut corriger manuellement les stats officielles, même
      sur un résultat déjà validé (classement recalculé)
- [x] **8. Tchat IA admin** — discussion libre avec l'IA (OpenRouter) depuis `/admin/chat`, sans accès
      aux données de la plateforme ; historique conservé côté navigateur (session) uniquement
- [x] **9. Verrouillage & gestion des effectifs** — réglage global bloquant les modifications de
      roster par les capitaines ; `/admin/rosters` permet à l'admin de gérer l'effectif de n'importe
      quelle équipe, y compris quand c'est verrouillé
- [x] **10. Emails transactionnels (Brevo)** — proposition de match reçue, match confirmé, rappel
      30 min avant (via tâche planifiée externe sur `/api/cron/match-reminders`), bienvenue à l'inscription
- [x] **11. Gestion des comptes (admin)** — `/admin/users` : suppression de compte (bloquée si des
      matchs/attributions actives existent, dernier admin protégé), déclenchement d'une réinitialisation
      de mot de passe pour n'importe quel utilisateur
- [x] **12. Matchs attribués avec fenêtre de négociation** — un admin attribue un match entre deux
      équipes sur une **période** (ex : du 11 au 13 juillet) plutôt qu'une heure fixe ; les équipes se
      mettent d'accord sur une date précise via `/planning` ; sans accord avant la fin de la fenêtre,
      le match est signalé aux admins (`/admin/assignments`) pour intervention directe
- [x] **13. Réinitialisation de mot de passe** — self-service (`/forgot-password` → email avec lien →
      `/reset-password`) ou déclenchée par un admin depuis `/admin/users`, via le modèle
      `VerificationToken` existant (pas de nouvelle table)

## Notes techniques

- **Temps réel (Mapban)** : Server-Sent Events via un bus d'événements en mémoire
  ([src/lib/realtime.ts](src/lib/realtime.ts)). OK pour un serveur unique ; pour du
  multi-instance/serverless, remplacer par Redis pub/sub, Pusher ou Ably (même interface).
- **Analyse IA des résultats** : désactivée par défaut (`AI_RESULT_ANALYSIS_ENABLED="false"`) —
  chaque équipe saisit manuellement ses stats, un repli heuristique local (règles simples sur les
  chiffres) reste actif gratuitement. Le code d'intégration OpenRouter (vision, `google/gemma-4-31b-it:free`
  par défaut) est conservé et se réactive en repassant la variable à `"true"`, sans redéploiement de code.
- **Tchat IA admin** : fonctionnalité séparée, toujours active tant que `OPENROUTER_API_KEY` est défini
  (indépendante du réglage ci-dessus).
- **Screenshots** : upload optionnel via `/api/upload`, stockés dans `uploads/` comme preuve pour
  l'admin en cas de litige (voir la section Déploiement pour le montage du volume persistant).
- **Emails (Brevo)** : sans `BREVO_API_KEY`, les envois sont silencieusement ignorés (juste loggés) —
  ne bloque jamais la création d'un compte, d'une proposition ou d'un match.
- **Rappel de match & escalade des attributions** : `/api/cron/match-reminders?secret=...` doit être
  appelée périodiquement par une tâche planifiée externe (Dokploy Scheduled Task, cron-job.org…) —
  l'app ne peut pas se réveiller toute seule à l'heure dite. Cette même route vérifie aussi les
  matchs attribués dont la fenêtre de négociation a expiré sans accord (passage en `ESCALATED`).
- **Validation absolue** : aucun résultat ne peut être finalisé par simple accord des deux capitaines —
  seul un compte `ADMIN` peut valider définitivement (`validateResult` / `adminUpdateResult`).

## Déploiement (Dokploy)

Le script `npm start` (`scripts/bootstrap-db.js` puis `next start`) applique
`prisma db push` (avec retry si la base n'est pas encore prête) puis le seed
avant de démarrer le serveur. Comme cette logique est branchée sur le script
`start` de `package.json` — pas sur un entrypoint Docker séparé — elle
s'exécute quelle que soit la commande de démarrage utilisée par la
plateforme (Dockerfile ou détection automatique type Nixpacks).

1. **Créer un service PostgreSQL** dans le projet, puis copier son *Internal Connection URL*.
2. **Créer une application** depuis ce dépôt GitHub (build type : Dockerfile recommandé).
3. **Variables d'environnement** à définir :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | l'*Internal Connection URL* du service Postgres |
   | `NEXTAUTH_SECRET` | un secret aléatoire (`openssl rand -base64 32`) |
   | `NEXTAUTH_URL` | l'URL publique de l'app, **avec le protocole** (ex : `https://ger.mondomaine.com`) |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | l'admin initial |
   | `OPENROUTER_API_KEY` | clé gratuite depuis [openrouter.ai/keys](https://openrouter.ai/keys) (tchat admin) |
   | `OPENROUTER_MODEL` | `google/gemma-4-31b-it:free` (optionnel, défaut déjà appliqué) |
   | `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` (optionnel, défaut déjà appliqué) |
   | `AI_RESULT_ANALYSIS_ENABLED` | `false` (défaut) — mettre `true` pour réactiver l'analyse IA des screenshots |
   | `BREVO_API_KEY` | clé depuis [app.brevo.com](https://app.brevo.com) (emails transactionnels) |
   | `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` | expéditeur **vérifié** dans Brevo |
   | `CRON_SECRET` | secret aléatoire, protège `/api/cron/match-reminders` |

4. **Port** : l'app écoute sur `3000`.
5. **Volume persistant (important)** : monter un volume Dokploy sur `/app/uploads`.
   Les screenshots uploadés par les équipes y sont stockés (route `/api/upload`) ;
   sans volume, ils sont perdus à chaque redéploiement du conteneur.
6. **Rappel de match (tâche planifiée)** : configurer une tâche planifiée (Dokploy Scheduled
   Task ou un cron externe gratuit type cron-job.org) qui appelle toutes les 1 à 5 minutes :
   `GET https://<votre-domaine>/api/cron/match-reminders?secret=<CRON_SECRET>`

Au premier démarrage, les tables sont créées et l'admin + le pool de maps sont seedés
automatiquement. En cas de doute sur la config, visiter `/api/health` : elle
rapporte l'état des variables d'env, de la connexion DB, des tables et du seed.
