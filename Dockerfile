FROM oven/bun:1 AS base

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Generate Prisma client
COPY prisma ./prisma
RUN bunx prisma generate

# Copy app source
COPY . .

# Build Next.js
RUN bun run build

# Production
FROM oven/bun:1-slim AS production
WORKDIR /app

COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/src ./src
COPY --from=base /app/tsconfig.json ./tsconfig.json
COPY --from=base /app/bin ./bin

ENV NODE_ENV=production
EXPOSE 3000 3001

CMD ["sh", "bin/start.sh"]
