FROM node:24-slim AS builder

WORKDIR /build

# Install pnpm and git
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate

# Clone the filecoin-ponder fork (pinned to main)
RUN git clone --depth 1 https://github.com/rvagg/filecoin-ponder.git ponder

# Install and build ponder
WORKDIR /build/ponder
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install
RUN pnpm --filter @ponder/utils run build
RUN pnpm --filter ponder run build

# Replace workspace:* with the actual version for @ponder/utils so the
# tarball is installable outside the monorepo
RUN UTILS_VERSION=$(node -e "console.log(require('./packages/utils/package.json').version)") && \
    cd packages/core && \
    sed -i "s|\"@ponder/utils\": \"workspace:\*\"|\"@ponder/utils\": \"file:/tarballs/ponder-utils-${UTILS_VERSION}.tgz\"|" package.json

# Pack both packages as tarballs
RUN cd packages/utils && pnpm pack --pack-destination /tarballs/
RUN cd packages/core && pnpm pack --pack-destination /tarballs/

RUN ls -la /tarballs/

# ---

FROM node:24-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.10.0 --activate

COPY --from=builder /tarballs/ /tarballs/

COPY package.json ./
RUN PONDER_TGZ=$(ls /tarballs/ponder-0.*.tgz) && \
    npm pkg set dependencies.ponder="file:${PONDER_TGZ}" && \
    pnpm install

COPY . .

ENV NO_COLOR=1
RUN chown -R node:node /app
USER node
CMD ["pnpm", "start"]
