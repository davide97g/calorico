# Build context is the repo root (see docker-compose.yml).
FROM node:24-alpine AS base
WORKDIR /app
ENV npm_config_update_notifier=false

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @calorico/api --include-workspace-root

FROM deps AS build
COPY apps/api apps/api
RUN npm run build -w @calorico/api

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace @calorico/api --include-workspace-root \
  && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/drizzle apps/api/drizzle

# tsx is a dev dependency, so migrations run from the compiled output.
WORKDIR /app/apps/api
USER node
EXPOSE 3001
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
