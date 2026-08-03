# syntax=docker/dockerfile:1.7
###############################################################################
#  Daghoip Ikassa — image de production
#
#  Build multi-étapes basé sur la sortie `standalone` de Next.js :
#  l'image finale ne contient que le serveur, les dépendances réellement
#  utilisées et les fichiers statiques (~150 Mo au lieu de ~1,2 Go).
#
#  Construction :
#    docker build \
#      --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
#      --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
#      --build-arg NEXT_PUBLIC_SITE_URL=https://daghoip-ikassa.ga \
#      -t daghoip-ikassa:latest .
#
#  Les variables NEXT_PUBLIC_* sont inlinées dans le bundle client au build :
#  elles DOIVENT être fournies en `--build-arg`. Les secrets (clé service_role)
#  restent, eux, des variables d'exécution.
###############################################################################

# --------------------------------- Base --------------------------------------
FROM node:22-alpine AS base
# libc6-compat : requis par certaines dépendances natives sur Alpine.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ----------------------------- Dépendances ------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
# `npm ci` garantit une installation reproductible depuis le lockfile.
RUN npm ci --ignore-scripts

# -------------------------------- Build ---------------------------------------
FROM base AS builder
WORKDIR /app

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ------------------------------- Runtime --------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Exécution sous un utilisateur non privilégié.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# La sortie `standalone` embarque le serveur et ses dépendances minimales.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Sonde de vivacité : la page d'accueil doit répondre.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
