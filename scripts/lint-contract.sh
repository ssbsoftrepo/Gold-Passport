#!/usr/bin/env bash
# Validates api/openapi.yaml with Redocly.
set -euo pipefail
cd "$(dirname "$0")/.."
npx --yes @redocly/cli@latest lint api/openapi.yaml --config api/redocly.yaml
