FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS build

WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY server/tsconfig.json ./
COPY shared/system-context.ts ./src/system-context.ts
COPY shared/table-metadata.ts ./src/table-metadata.ts
COPY indexer/src/schema-defs.ts ./src/schema-defs.ts
COPY server/src/ ./src/
RUN ./node_modules/.bin/tsc && npm prune --omit=dev --ignore-scripts --offline

FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/main.js"]
