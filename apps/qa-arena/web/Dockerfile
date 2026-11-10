FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/qa-arena/web/package.json apps/qa-arena/web/
RUN pnpm install --frozen-lockfile --filter @arena/web...
COPY tsconfig.base.json ./
COPY apps/qa-arena/web apps/qa-arena/web
WORKDIR /repo/apps/qa-arena/web
RUN pnpm build

FROM nginx:alpine
COPY apps/qa-arena/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/qa-arena/web/dist /usr/share/nginx/html
EXPOSE 80
