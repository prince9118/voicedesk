# VoiceDesk voice agent. Build from the repository root:
#   docker build -f apps/agent/Dockerfile .
FROM node:24.15.0-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/agent/package.json apps/agent/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @voicedesk/agent --include=dev --no-audit --no-fund

COPY apps/agent apps/agent
WORKDIR /app/apps/agent
RUN npx --no-install tsc -p tsconfig.json

USER node

# "start" is the SDK's production mode (no file watching, production logging).
CMD ["node", "dist/main.js", "start"]
