#!/usr/bin/env bash
# Regenerates the TypeScript API types of the web and mobile apps from api/openapi.yaml.
# Run after every contract change and commit the result.
set -euo pipefail
cd "$(dirname "$0")/.."
(cd apps/web && npm run api:generate)
(cd apps/mobile && npm run api:generate)
