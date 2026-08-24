# Hermes3D - 3D agent visualization for Hermes.
# Multi-stage build: install prod deps -> build Next.js -> run with custom server.
#
# Node 22 is required: the runner ships next.config.ts without the `typescript`
# devDependency, so Next auto-installs it at startup, which pulls in transitive
# deps (e.g. camera-controls) that require Node >=22. On Node 20 that install
# fails and the app crash-loops before ever binding to a port.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev

FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time gateway URL (overridden at runtime by HERMES3D_GATEWAY_URL).
ENV NEXT_PUBLIC_GATEWAY_URL=ws://127.0.0.1:18789
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Links images to the repository on GHCR, so packages created by a push
# automatically grant this repo's workflows access and show up on the repo page.
LABEL org.opencontainers.image.source="https://github.com/iamlukethedev/Hermes3D"
LABEL org.opencontainers.image.description="Hermes3D — a 3D workspace for AI agents."
LABEL org.opencontainers.image.licenses="MIT"

# Copy built app + custom server + production node_modules only.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["node", "server/index.js"]
