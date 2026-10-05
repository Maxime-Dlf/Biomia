# Client statique + Caddy (§16.6) : le client est construit dans l'image, aucun Node sur l'hôte.
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/client ./apps/client
# Manifestes des autres paquets du workspace, pour que le lockfile corresponde.
COPY apps/server/package.json ./apps/server/
COPY tools/package.json ./tools/
RUN pnpm install --frozen-lockfile --filter @crassecadia/client...
# Adresses publiques du serveur et identifiant de l'application Discord (non secret).
ARG VITE_SERVER_URL
ARG VITE_API_URL
ARG VITE_DISCORD_CLIENT_ID
ENV VITE_SERVER_URL=$VITE_SERVER_URL VITE_API_URL=$VITE_API_URL VITE_DISCORD_CLIENT_ID=$VITE_DISCORD_CLIENT_ID
RUN pnpm --filter @crassecadia/client build

FROM caddy:2
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/client/dist /srv/client
