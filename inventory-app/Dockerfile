# syntax=docker/dockerfile:1

# ---- Build stage -------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# OpenSSL is required by Prisma engines.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install all deps (incl. dev) for the build + prisma CLI + tsx (used by seed).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Generate the Prisma client and build Next.js.
# DATABASE_URL is only needed at runtime; a placeholder keeps Prisma happy at build.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
RUN npx prisma generate
RUN npm run build

# ---- Runtime stage -----------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy the full build output. We keep all node_modules so the Prisma CLI
# (migrate deploy) and tsx (seed) are available at container start.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
