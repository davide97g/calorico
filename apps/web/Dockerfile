# Build context is the repo root (see docker-compose.yml).
FROM node:24-alpine AS build
WORKDIR /app
ENV npm_config_update_notifier=false
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci --workspace @calorico/web --include-workspace-root
# The contract is compiled first: `tsc -b` types the app from its declarations.
COPY packages/contracts packages/contracts
RUN npm run build -w @calorico/contracts
COPY apps/web apps/web
# Empty VITE_API_URL keeps requests same-origin so nginx can proxy /api.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
# Baked into the bundle, so this DSN is public by design — Sentry browser DSNs
# are. Empty means the browser SDK is never loaded.
ARG VITE_SENTRY_DSN=""
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT="production"
ENV VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT
RUN npm run build -w @calorico/web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/security-headers.conf /etc/nginx/security-headers.conf
# Tighter policy for the static legal pages, which run no script at all.
COPY apps/web/security-headers-marketing.conf /etc/nginx/security-headers-marketing.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
