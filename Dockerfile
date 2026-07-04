FROM ubuntu:24.04

LABEL org.opencontainers.image.title="sporza-wielermanager" \
      org.opencontainers.image.description="Sporza Wielermanager SvelteKit dashboard + AI team manager"

WORKDIR /app

ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    RUNNING_IN_DOCKER=true \
    BROWSER_MODE=auto \
    HEADLESS=true \
    PORT=3000

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://bun.sh/install | bash \
    && ln -sf /root/.bun/bin/bun /usr/local/bin/bun \
    && ln -sf /root/.bun/bin/bunx /usr/local/bin/bunx

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile || bun install

RUN bunx playwright install chromium --with-deps

COPY . .

RUN chmod +x scripts/docker-entrypoint.sh

RUN bun --bun run build

RUN mkdir -p /app/data

EXPOSE 3000

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
