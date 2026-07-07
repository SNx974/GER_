#!/bin/sh
set -e

echo "→ Vérification des variables d'environnement requises…"
: "${DATABASE_URL:?DATABASE_URL n'est pas défini}"
: "${NEXTAUTH_SECRET:?NEXTAUTH_SECRET n'est pas défini}"

echo "→ Attente de la disponibilité de la base de données…"
attempt=0
until echo "SELECT 1;" | npx prisma db execute --stdin --schema=./prisma/schema.prisma >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "❌ Base de données injoignable après 30 tentatives. Vérifier DATABASE_URL."
    exit 1
  fi
  echo "  … base indisponible, nouvelle tentative dans 2s ($attempt/30)"
  sleep 2
done
echo "✔ Base de données joignable."

echo "→ Synchronisation du schéma (prisma db push)…"
npx prisma db push --skip-generate --accept-data-loss

echo "→ Seed (idempotent : admin + pool de maps + réglages)…"
if ! npx prisma db seed; then
  echo "⚠️  Le seed a échoué — vérifier ADMIN_EMAIL / ADMIN_PASSWORD (voir logs ci-dessus)."
fi

echo "→ Démarrage de Next.js…"
exec npm run start
