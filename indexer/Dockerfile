FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ponder.schema.ts ./
COPY abis ./abis
COPY src ./src
COPY docker-entrypoint.sh ./
RUN chmod +x /app/docker-entrypoint.sh

ENV NO_COLOR=1
RUN chown -R node:node /app
USER node
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "start"]
