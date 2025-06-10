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

# Function to wait for migration to complete
wait_for_migration() {
  echo "⏳ Waiting for migration to complete..."

  local counter=0
  local max_attempts=150  # 150 * 2 seconds = 5 minutes
  local migration_completed=false
  local container_name="service-migration-${ENV_SUFFIX}"

  while [ $counter -lt $max_attempts ]; do
    # Check if migration container exists
    if ! docker ps -a --format "table {{.Names}}" | grep -q "^${container_name}$"; then
      echo "❌ Migration container not found!"
      return 1
    fi

    # Check container status
    local status=$(docker inspect -f '{{.State.Status}}' "$container_name" 2>/dev/null || echo "unknown")

    case "$status" in
      "exited")
        # Check exit code
        local exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$container_name")
        if [ "$exit_code" -eq 0 ]; then
          echo "✅ Migration completed successfully!"
          migration_completed=true
          break
        else
          echo "❌ Migration failed with exit code $exit_code"
          docker logs "$container_name" --tail 50
          return 1
        fi
        ;;
      "running")
        # Check logs for completion message
        if docker logs "$container_name" 2>&1 | grep -q "Migration Service completed"; then
          echo "✅ Migration completed (detected via logs)!"
          migration_completed=true
          break
        fi
        ;;
      *)
        echo "⚠️  Migration container status: $status"
        ;;
    esac

    counter=$((counter + 1))
    echo "Still waiting... ($counter/$max_attempts)"
    sleep 2
  done

  if [ "$migration_completed" = false ]; then
    echo "❌ Migration timed out!"
    docker logs "$container_name" --tail 100
    return 1
  fi

  # Show final migration logs
  echo ""
  echo "📋 Final migration logs:"
  docker logs "$container_name" --tail 30

  return 0
}

# Function to run migration
run_migration() {
  echo "🔄 Starting migration service..."

  # Stop and remove any existing migration container
  docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" stop migration 2>/dev/null || true
  docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" rm -f migration 2>/dev/null || true

  # Start migration service
  docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" up -d --build migration

  # Wait for migration to complete
  if ! wait_for_migration; then
    echo "❌ Migration failed!"
    exit 1
  fi

  # Clean up migration container
  echo "🧹 Cleaning up migration container..."
  docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" stop migration
  docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" rm -f migration
}

if [[ "$ACTION" == "deploy" ]]; then
  if [[ "$SCOPE" == "services" ]]; then
    echo "🧹 Cleaning up microservices only..."
    docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" stop "${MICROSERVICES[@]}"
    docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" rm -f "${MICROSERVICES[@]}"

    # Run migration first
    run_migration

    echo "🚀 Starting microservices only (${MICROSERVICES[*]})..."
    docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" up -d --build "${MICROSERVICES[@]}"
  else
    echo "🧹 Cleaning up all containers and networks..."
    docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" down --remove-orphans

    # Ensure infrastructure services are up first
    echo "🏗️  Starting infrastructure services (RabbitMQ)..."
    docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" up -d rabbitmq

    # Run migration first
    run_migration

    ALL_SERVICES=(rabbitmq "${MICROSERVICES[@]}")
    echo "🚀 Starting all services (except migration)..."
    docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" up -d --build "${ALL_SERVICES[@]}"

#    echo "🚀 Starting all services..."
#    docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" up -d --build
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
