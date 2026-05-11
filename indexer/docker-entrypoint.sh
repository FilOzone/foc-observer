#!/bin/sh
set -eu

if [ ! -r ponder.config.ts ]; then
  echo "Missing /app/ponder.config.ts. Mount a network-specific Ponder config before starting the indexer." >&2
  exit 1
fi

exec "$@"
