FROM node:20-alpine AS builder

RUN corepack enable
WORKDIR /app

# Copy workspace root configs
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.json tsconfig.base.json ./

# Copy package manifests
COPY packages/web/package.json ./packages/web/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/web/ ./packages/web/
COPY packages/shared/ ./packages/shared/

# Build shared package first, then web
RUN pnpm --filter @read-pal/shared build
RUN pnpm --filter @read-pal/web build

# Production image
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/web/.next/standalone ./
COPY --from=builder /app/packages/web/.next/static ./packages/web/.next/static
RUN mkdir -p /app/packages/web/public
EXPOSE 3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "packages/web/server.js"]
