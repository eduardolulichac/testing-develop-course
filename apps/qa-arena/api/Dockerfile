FROM node:24-alpine
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/scenario-engine/package.json packages/scenario-engine/
COPY apps/qa-arena/scenarios/package.json apps/qa-arena/scenarios/
COPY apps/qa-arena/api/package.json apps/qa-arena/api/
RUN pnpm install --frozen-lockfile --filter @arena/api...
COPY tsconfig.base.json ./
COPY packages/scenario-engine packages/scenario-engine
COPY apps/qa-arena/scenarios apps/qa-arena/scenarios
COPY apps/qa-arena/api apps/qa-arena/api
# Builds the engine and the scenarios first (dependency order); the API then loads their `dist`.
RUN pnpm --filter @arena/api... build
WORKDIR /repo/apps/qa-arena/api
ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node", "dist/server.js"]
