#!/bin/sh
set -e

echo "→ Synchronisation du schéma (prisma db push)…"
npx prisma db push --skip-generate

echo "→ Seed (idempotent : admin + pool de maps + réglages)…"
npx prisma db seed || echo "  ⚠️  Seed non exécuté (vérifier ADMIN_EMAIL / ADMIN_PASSWORD)"

echo "→ Démarrage de Next.js…"
exec npm run start
