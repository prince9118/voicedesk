# VoiceDesk API. Build from the repository root (npm workspaces share one lockfile):
#   docker build -f apps/api/Dockerfile .
FROM node:24.15.0-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first (cached unless a package.json or the lockfile changes).
# Dev dependencies are kept on purpose: the Prisma CLI runs migrations when the container starts.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/agent/package.json apps/agent/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @voicedesk/api --include=dev --no-audit --no-fund

COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npx --no-install prisma generate && npx --no-install tsc -p tsconfig.json

# Run as the unprivileged "node" user, not root.
USER node
EXPOSE 4000

# On every start: apply pending migrations, refresh help articles (skips unchanged ones), then serve.
# Both steps are idempotent, so restarts and redeploys are safe.
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && node dist/scripts/kb-ingest.js && exec node dist/server.js"]
