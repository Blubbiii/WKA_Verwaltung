# =============================================================================
# WindparkManager - Production Dockerfile
# Multi-Stage Build fuer optimale Image-Groesse
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# Installiert alle Dependencies (inklusive devDependencies fuer Build)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

# Build-Tools fuer native npm-Module (jsdom, Sentry, etc.)
# libc6-compat: Kompatibilitaet fuer glibc-basierte Module
# python3, make, g++: Kompilierung nativer Addons (node-gyp)
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Package files kopieren
COPY package.json package-lock.json ./

# Dependencies installieren
# npm install statt npm ci: Lockfile wird auf Windows generiert und enthaelt
# keine Linux/Alpine-spezifischen optionalen Dependencies (SWC, Parcel, Rollup).
# npm install loest diese automatisch fuer die aktuelle Plattform auf.
RUN npm install

# -----------------------------------------------------------------------------
# Stage 2: Builder
# Baut die Next.js Anwendung
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Dependencies aus vorheriger Stage kopieren
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Platform-spezifische optionale Dependencies nachinstallieren
# Das Lockfile wird auf Windows generiert und enthaelt keine Alpine/musl Binaries
RUN npm install @parcel/watcher-linux-x64-musl @rollup/rollup-linux-x64-musl --no-save 2>/dev/null; true

# Prisma Client generieren
RUN npx prisma generate

# Environment fuer Build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Next.js bauen (mit Dummy-Werten fuer Build-Zeit ENV vars)
# Diese werden zur Laufzeit durch echte Werte ersetzt
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# Build mit erhoehtem Memory-Limit (Next.js Build braucht ~2GB)
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2b: Prisma CLI (saubere Installation mit allen transitiven Deps)
# Separate Stage, weil Next.js standalone Output ein eigenes node_modules
# mitbringt, das @prisma/config ohne dessen Dep 'effect' enthaelt.
# npm install im Runner wuerde 'effect' ueberspringen, da @prisma/config
# bereits existiert. Deshalb: saubere Installation in isolierter Stage.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS prisma-cli
WORKDIR /prisma
RUN npm init -y > /dev/null 2>&1 && npm install prisma

# -----------------------------------------------------------------------------
# Stage 3: Runner (Production)
# Minimales Production Image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Production Environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Sicherheit: Non-root User erstellen
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Notwendige Pakete fuer Healthchecks und Prisma
RUN apk add --no-cache curl openssl

# Statische Assets kopieren
COPY --from=builder /app/public ./public

# Standalone Output kopieren (inkl. Server und App-Runtime node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma CLI mit ALLEN transitiven Dependencies aus sauberer Installation kopieren
# Docker COPY merged Verzeichnisse: existierende Dateien aus standalone bleiben,
# neue Dateien (prisma, effect, @prisma/config etc.) werden hinzugefuegt
COPY --from=prisma-cli /prisma/node_modules ./node_modules

# Prisma Schema und generierter Client kopieren
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Entrypoint Script kopieren
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Verzeichnis-Berechtigungen setzen
RUN mkdir -p .next
RUN chown -R nextjs:nodejs /app

# Non-root User aktivieren
USER nextjs

# Port exponieren
EXPOSE 3000

# Environment Variable fuer Port
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Entrypoint (fuehrt Migrations aus, dann startet App)
ENTRYPOINT ["./docker-entrypoint.sh"]

# Start Command
CMD ["node", "server.js"]
