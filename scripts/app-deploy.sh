#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-}"
ACTION="${2:-deploy}"  # "deploy" or "stop"
SCOPE="${3:-all}"      # "all" or "services"

if [[ -z "$ENVIRONMENT" ]]; then
  echo "❌ Missing environment argument"
  echo "Usage: bash scripts/app-deploy.sh <test|dev|stg|prod> [deploy|stop] [all|services]"
  echo ""
  echo "Examples:"
  echo "  bash scripts/app-deploy.sh dev deploy all       # Deploy all services"
  echo "  bash scripts/app-deploy.sh dev deploy services  # Deploy microservices only"
  echo "  bash scripts/app-deploy.sh dev stop all         # Stop all services"
  echo "  bash scripts/app-deploy.sh dev stop services    # Stop microservices only"
  exit 1
fi

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(test|dev|stg|prod)$ ]]; then
  echo "❌ Invalid environment '$ENVIRONMENT'. Must be one of: test, dev, stg, prod"
  exit 1
fi

# Validate action
if [[ ! "$ACTION" =~ ^(deploy|stop)$ ]]; then
  echo "❌ Invalid action '$ACTION'. Must be one of: deploy, stop"
  exit 1
fi

# Validate scope
if [[ ! "$SCOPE" =~ ^(all|services)$ ]]; then
  echo "❌ Invalid scope '$SCOPE'. Must be one of: all, services"
  exit 1
fi

# 📄 Single environment file
ENV_FILE="scripts/.env.docker"
DOCKER_FILE="docker-compose.yml"

# 📦 Load environment variables from single .env.docker file
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Environment file '$ENV_FILE' not found"
  exit 1
fi
echo "📦 Loading environment variables from $ENV_FILE..."
export $(grep -v '^#' "$ENV_FILE" | xargs)

# 🔧 Set environment-specific variables
export ENV_SUFFIX="$ENVIRONMENT"
export COMPOSE_PROJECT_NAME="aragon-$ENVIRONMENT"

echo "🔧 Environment: $ENVIRONMENT"
echo "🔧 Action: $ACTION"
echo "🔧 Scope: $SCOPE"
echo "🔧 Project: $COMPOSE_PROJECT_NAME"
echo "🔧 ENV_SUFFIX: $ENV_SUFFIX"
echo "🔧 Compose file: $DOCKER_FILE"

# List of microservice names (as defined in compose)
# Note: These are service names, not container names
# Container names will be suffixed with ENV_SUFFIX (e.g., service-aragon-api-dev)
MICROSERVICES=(
  service-aragon-api
  service-aragon-admin-api
  service-aragon-indexer
  service-aragon-dao
  service-aragon-plugins
  service-aragon-rates
)

if [[ "$ACTION" == "deploy" ]]; then
  if [[ "$SCOPE" == "services" ]]; then
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

elif [[ "$ACTION" == "stop" ]]; then
  if [[ "$SCOPE" == "services" ]]; then
    echo "🛑 Stopping microservices only (${MICROSERVICES[*]})..."
    docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" stop "${MICROSERVICES[@]}"
  else
    echo "🛑 Stopping all services and removing containers..."
    docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" down --remove-orphans
  fi
fi

echo "✅ Operation completed successfully!"
