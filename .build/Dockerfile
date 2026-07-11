# syntax=docker/dockerfile:1.7

# Production is Linux/amd64. Pin the platform manifests so CI and the droplet
# build from the exact same inputs instead of following mutable Alpine tags.
ARG NODE_IMAGE=docker.io/library/node:24-alpine@sha256:4ba75f835bb8802193e4c114572113d4b26f95f6f094f4b5229d2a77773e0afc
ARG CADDY_IMAGE=docker.io/library/caddy:2.11.4-alpine@sha256:98eb57d882ccd5213d1688764db10c1ca2c58a1ca3a6717a3411ad798f7a423a

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .

# The production edge is same-origin. Values are build arguments because the
# final container is read-only and must never rewrite JavaScript at startup.
ARG VITE_API_BASE=/api/v1
ARG VITE_WS_URL=/ws
ARG VITE_MAP_CENTER=52.5,-96.8
ARG VITE_MAP_ZOOM=3.2
ENV VITE_API_BASE=${VITE_API_BASE} \
    VITE_WS_URL=${VITE_WS_URL} \
    VITE_MAP_CENTER=${VITE_MAP_CENTER} \
    VITE_MAP_ZOOM=${VITE_MAP_ZOOM}
RUN npm run build && test -s dist/index.html

FROM ${CADDY_IMAGE} AS runtime

ARG BUILD_SHA=unknown
ARG BUILD_TIME=unknown
ARG BUILD_VERSION=0.0.0
LABEL org.opencontainers.image.title="Beacon Web" \
      org.opencontainers.image.description="Beacon SPA and same-origin API edge" \
      org.opencontainers.image.source="https://github.com/n30nex/beacon-web" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.revision="${BUILD_SHA}" \
      org.opencontainers.image.created="${BUILD_TIME}" \
      org.opencontainers.image.version="${BUILD_VERSION}"

COPY .build/Caddyfile /etc/caddy/Caddyfile
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
COPY --from=build --chown=10001:10001 /app/dist /srv

# Caddy does not need persistent state: TLS terminates at Cloudflare, the admin
# API and config persistence are disabled, and the listener is unprivileged.
ENV HOME=/tmp \
    XDG_CONFIG_HOME=/tmp/.config \
    XDG_DATA_HOME=/tmp/.local/share
USER 10001:10001
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

ENTRYPOINT ["caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
