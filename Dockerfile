# syntax=docker/dockerfile:1.7

FROM node:24-trixie AS base
WORKDIR /app

# Same pnpm release as package.json "packageManager".
RUN npm install --global pnpm@12.10.1 \
  && npm cache clean --force

############################
# Builder
############################
FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --store-dir /pnpm/store

COPY . .

RUN NODE_ENV=production pnpm run build

RUN mkdir -p /runtime-data

############################
# Minimal runtime image
############################
FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runner

WORKDIR /app

ENV NODE_ENV=production \
  NITRO_PORT=3000 \
  HOST=0.0.0.0 \
  NUXT_DATA_DIR=/data

USER 1001:1001

COPY --from=builder --chown=1001:1001 /runtime-data /data
COPY --from=builder --chown=1001:1001 /app/.output ./.output

EXPOSE 3000
CMD ["/app/.output/server/index.mjs"]
