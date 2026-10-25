#!/usr/bin/env bash
# Starts PostgreSQL (Docker) and runs the backend with the `local` profile (demo users, OTP 123456).
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d postgres
mvn -f backend/pom.xml spring-boot:run -Dspring-boot.run.profiles=local
