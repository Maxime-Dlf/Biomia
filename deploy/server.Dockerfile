# Serveur autoritaire CrasseCadia (§15.2, §16.6) : Node 24, dépendances installées avec pnpm.
FROM node:24-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server
# Manifestes des autres paquets du workspace, pour que le lockfile corresponde.
COPY apps/client/package.json ./apps/client/
COPY tools/package.json ./tools/
RUN pnpm install --frozen-lockfile --filter @crassecadia/server...
ENV NODE_ENV=production PORT=2567
EXPOSE 2567
WORKDIR /app/apps/server
USER node
# tsx exécute le TypeScript directement (pas d'étape de compilation, §15.2).
CMD ["node_modules/.bin/tsx", "src/index.ts"]
