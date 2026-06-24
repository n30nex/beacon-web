ARG CADDY_VERSION=2-alpine
ARG CADDY_BUILDER_VERSION=2-builder-alpine
ARG CADDY_RATELIMIT_MODULE=github.com/mholt/caddy-ratelimit@v0.1.0

FROM caddy:${CADDY_BUILDER_VERSION} AS builder
ARG CADDY_RATELIMIT_MODULE
RUN xcaddy build --with "${CADDY_RATELIMIT_MODULE}"

FROM caddy:${CADDY_VERSION}
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
