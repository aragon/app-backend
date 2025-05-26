#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-}"
MODE="${2:-all}"  # "all" or "services"

if [[ -z "$ENVIRONMENT" ]]; then
  echo "❌ Missing environment argument (dev | prod)"
  echo "Usage: bash scripts/app-deploy.sh <dev|prod> [all|services]"
  exit 1
fi

# 📄 Filenames
ENV_FILE="scripts/.env.docker-${ENVIRONMENT}"
DOCKER_FILE="docker-compose.yml"

# 📦 Load environment variables
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Environment file '$ENV_FILE' not found"
  exit 1
fi
echo "📦 Loading environment variables from $ENV_FILE..."
export $(grep -v '^#' "$ENV_FILE" | xargs)

# ✅ Compose project name is now set
echo "🔧 Project: ${COMPOSE_PROJECT_NAME:-<not set>}"
echo "🔧 ENV_SUFFIX: ${ENV_SUFFIX:-<not set>}"
echo "🔧 Compose file: ${DOCKER_FILE}"

# List of microservice names (as defined in compose)
MICROSERVICES=(
  service-aragon-api
  service-aragon-admin-api
  service-aragon-indexer
  service-aragon-dao
  service-aragon-plugins
  service-aragon-rates
)

if [[ "$MODE" == "services" ]]; then
  echo "🧹 Cleaning up microservices only..."
  docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" stop "${MICROSERVICES[@]}"
  docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" rm -f "${MICROSERVICES[@]}"

  echo "🚀 Starting microservices only (${MICROSERVICES[*]})..."
  docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" up -d --build "${MICROSERVICES[@]}"
else
  echo "🧹 Cleaning up all containers and networks..."
  docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" down --remove-orphans

  echo "🚀 Starting all services..."
  docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" up -d --build
fi
