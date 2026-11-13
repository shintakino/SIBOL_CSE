FROM node:24-slim AS builder
RUN npm install -g pnpm@11.1.1
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --frozen-lockfile --store-dir /pnpm-store
RUN pnpm --filter server build

FROM oven/bun:1.4.4-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=bun:bun /app/apps/server/dist ./dist
USER bun
EXPOSE 3000
CMD ["bun", "dist/index.mjs"]
