FROM ubuntu:24.04

LABEL org.opencontainers.image.title="sporza-wielermanager" \
      org.opencontainers.image.description="Sporza Wielermanager API + AI team manager"

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
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://bun.sh/install | bash \
    && ln -sf /root/.bun/bin/bun /usr/local/bin/bun \
    && ln -sf /root/.bun/bin/bunx /usr/local/bin/bunx

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile || bun install

# Bundled Chromium for headless VRT login in containers
RUN bunx playwright install chromium --with-deps

COPY src/ ./src/
COPY .env.example ./.env.example

RUN mkdir -p /app/data

EXPOSE 3000

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/health || exit 1

CMD ["bun", "run", "src/server.js"]
