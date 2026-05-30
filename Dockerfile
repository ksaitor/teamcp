FROM oven/bun:1 AS base

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Generate Prisma client
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN bunx prisma generate

# Copy app source
COPY . .

# Build Next.js
RUN bun run build

# Production
FROM oven/bun:1-slim AS production
WORKDIR /app

# Prisma's query engine links libssl.so.3 at runtime; bun:1-slim omits it.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends libssl3 openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The custom server (server.ts) doesn't use Next's standalone output, so ship
# the full build plus everything the server needs at runtime.
COPY --from=base /app/.next ./.next
COPY --from=base /app/public ./public
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/prisma.config.ts ./prisma.config.ts
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/src ./src
COPY --from=base /app/next.config.ts ./next.config.ts
COPY --from=base /app/server.ts ./server.ts
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/tsconfig.json ./tsconfig.json
COPY --from=base /app/bin ./bin

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "bin/start.sh"]
