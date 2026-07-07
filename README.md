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
- [x] **4. Résultats + analyse IA** — soumission score/stats/screenshots, analyse OpenAI (repli heuristique), double validation
- [x] **5. Leaderboard** — classement équipes (points/V-D) + individuel (TOP KILLER)

## Notes techniques

- **Temps réel (Mapban)** : Server-Sent Events via un bus d'événements en mémoire
  ([src/lib/realtime.ts](src/lib/realtime.ts)). OK pour un serveur unique ; pour du
  multi-instance/serverless, remplacer par Redis pub/sub, Pusher ou Ably (même interface).
- **Analyse IA** : reconnaissance d'image via **Google Gemini** (`GEMINI_API_KEY`).
  Les screenshots sont téléchargés et envoyés en inline à Gemini pour comparer les
  stats déclarées aux tableaux des scores. Sans clé, repli heuristique local.
- **Screenshots** : stockés sous forme d'URLs (pas d'upload de fichiers intégré pour l'instant).

## Déploiement (Dokploy)

Le projet contient un `Dockerfile` et un `docker-entrypoint.sh` (qui applique
`prisma db push` puis le seed avant de démarrer). Sur Dokploy :

1. **Créer un service PostgreSQL** dans le projet, puis copier son *Internal Connection URL*.
2. **Créer une application** depuis ce dépôt GitHub (build type : Dockerfile).
3. **Variables d'environnement** à définir :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | l'*Internal Connection URL* du service Postgres |
   | `NEXTAUTH_SECRET` | un secret aléatoire (`openssl rand -base64 32`) |
   | `NEXTAUTH_URL` | l'URL publique de l'app (ex : `https://ger.mondomaine.com`) |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | l'admin initial |
   | `GEMINI_API_KEY` | clé Google AI Studio (reconnaissance d'image) |
   | `GEMINI_MODEL` | `gemini-2.0-flash` (optionnel) |

4. **Port** : l'app écoute sur `3000`.

Au premier démarrage, les tables sont créées et l'admin + le pool de maps sont seedés
automatiquement.
