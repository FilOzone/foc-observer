FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54

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
