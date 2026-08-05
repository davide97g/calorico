# Build context is the repo root (see docker-compose.yml).
FROM node:24-alpine AS build
WORKDIR /app
ENV npm_config_update_notifier=false
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @calorico/web --include-workspace-root
COPY apps/web apps/web
# Empty VITE_API_URL keeps requests same-origin so nginx can proxy /api.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w @calorico/web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
