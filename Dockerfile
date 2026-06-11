FROM node:22-alpine AS base

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/
COPY shared/package.json ./shared/

RUN pnpm install --frozen-lockfile --config.minimumReleaseAge=0 --config.onlyBuiltDependencies='better-sqlite3,esbuild'

COPY . .

RUN pnpm run build

FROM node:22-alpine AS production

WORKDIR /app

COPY --from=base /app/package.json ./
COPY --from=base /app/pnpm-lock.yaml ./
COPY --from=base /app/pnpm-workspace.yaml ./
COPY --from=base /app/packages/server/package.json ./packages/server/
COPY --from=base /app/packages/client/package.json ./packages/client/
COPY --from=base /app/shared/package.json ./shared/
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/server/dist ./packages/server/dist
COPY --from=base /app/packages/client/dist ./packages/client/dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "packages/server/dist/index.js"]
