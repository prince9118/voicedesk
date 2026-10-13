# VoiceDesk web app + reverse proxy. Build from the repository root:
#   docker build -f apps/web/Dockerfile .
# Stage 1 builds the static React app; stage 2 is Caddy, which serves it, proxies /api to the API,
# and obtains HTTPS certificates automatically.

FROM node:24.15.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/agent/package.json apps/agent/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @voicedesk/web --include=dev --no-audit --no-fund
COPY apps/web apps/web
WORKDIR /app/apps/web
RUN npm run build

FROM caddy:2.10.2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
