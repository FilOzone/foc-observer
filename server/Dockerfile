FROM node:24-slim

WORKDIR /app

COPY server/package.json ./
RUN npm install --ignore-scripts

COPY server/tsconfig.json ./
COPY shared/system-context.ts ./src/system-context.ts
COPY shared/table-metadata.ts ./src/table-metadata.ts
COPY indexer/src/schema-defs.ts ./src/schema-defs.ts
COPY server/src/ ./src/
RUN npx tsc

RUN mkdir -p /data/logs && chown -R node:node /app /data
USER node
CMD ["node", "dist/main.js"]
