# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Full build with devDependencies — also used directly (as a build `target`)
# to run `prisma migrate deploy` / `prisma db seed`, since those need the
# Prisma CLI that the pruned standalone runner below does not ship.
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Minimal runtime image: Next's standalone output + the generated Prisma
# client. No native Prisma engine binaries are needed here since the schema
# uses the @prisma/adapter-pg driver adapter (pure JS, over `pg`).
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
