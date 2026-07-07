# ─── Base ───
FROM node:22-alpine AS base
WORKDIR /app
# Prisma a besoin d'openssl sur Alpine
RUN apk add --no-cache openssl

# ─── Dépendances ───
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ─── Build ───
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ─── Runtime ───
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 3000
# "npm start" applique le schéma + le seed (scripts/bootstrap-db.js) avant de
# lancer Next.js — voir package.json. Fonctionne même si la plateforme de
# déploiement ignore ce CMD et invoque sa propre commande `npm start`.
CMD ["npm", "run", "start"]
