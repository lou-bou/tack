# syntax=docker/dockerfile:1

# better-sqlite3 compiles from source when no prebuilt binary matches, so the stages that run
# npm ci get a toolchain. The runtime image stays slim and only receives the result.
FROM node:24-bookworm-slim AS toolchain
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/

FROM toolchain AS build
RUN npm ci
COPY . .
RUN npm run build

FROM toolchain AS deps
RUN npm ci --omit=dev --workspace=server --include-workspace-root=false && npm cache clean --force

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app ./
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
RUN mkdir -p /data && chown node:node /data
USER node
ENV PORT=8097 DB_PATH=/data/tack.db
EXPOSE 8097
CMD ["node", "server/dist/index.js"]
