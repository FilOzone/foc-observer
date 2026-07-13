FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ponder.config.ts ponder.schema.ts ./
COPY abis ./abis
COPY src ./src

ENV NO_COLOR=1
RUN chown -R node:node /app
USER node
CMD ["npm", "start"]
