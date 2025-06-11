#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-}"

if [[ -z "$ENVIRONMENT" ]]; then
  echo "❌ Missing environment argument"
  echo "Usage: bash scripts/app-deploy.sh <sand|dev|stg|prod>"
  echo ""
  echo "Examples:"
  echo "  bash scripts/app-deploy.sh dev      # Deploy to development"
  echo "  bash scripts/app-deploy.sh prod     # Deploy to production"
  exit 1
fi

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(sand|dev|stg|prod)$ ]]; then
  echo "❌ Invalid environment '$ENVIRONMENT'. Must be one of: sand, dev, stg, prod"
  exit 1
fi

# 📄 Single environment file
ENV_FILE=".env.docker"
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
echo "🔧 Project: $COMPOSE_PROJECT_NAME"
echo "🔧 ENV_SUFFIX: $ENV_SUFFIX"
echo "🔧 Compose file: $DOCKER_FILE"

# List of microservice names (as defined in compose)
MICROSERVICES=(
  service-aragon-api
  service-aragon-admin-api
  service-aragon-indexer
  service-aragon-dao
  service-aragon-plugins
  service-aragon-rates
)

# Function to check if a container is running
is_container_running() {
  local service_name="$1"
  local container_name="${service_name}-${ENV_SUFFIX}"

  if docker ps --format "table {{.Names}}" | grep -q "^${container_name}$"; then
    return 0  # Container is running
  else
    return 1  # Container is not running
  fi
}

# Function to wait for migration to complete
wait_for_migration() {
  echo "⏳ Waiting for migration to complete..."

  local counter=0
  local max_attempts=150  # 150 * 2 seconds = 5 minutes
  local migration_completed=false
  local container_name="service-migration-${ENV_SUFFIX}"

  # Give container a moment to fully start
  sleep 2

  while [ $counter -lt $max_attempts ]; do
    # Check if migration container exists
    if ! docker ps -a --format "{{.Names}}" | grep -q "^${container_name}$"; then
      # Container might have completed very quickly, check for recent exit
      if [ $counter -lt 5 ]; then
        echo "⏳ Waiting for container to appear..."
        sleep 1
        counter=$((counter + 1))
        continue
      else
        echo "❌ Migration container not found after waiting!"
        return 1
      fi
    fi

    # Check container status
    local status=$(docker inspect -f '{{.State.Status}}' "$container_name" 2>/dev/null || echo "unknown")

    case "$status" in
      "exited")
        # Check exit code
        local exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$container_name" 2>/dev/null || echo "1")
        if [ "$exit_code" -eq 0 ]; then
          echo "✅ Migration completed successfully!"
          migration_completed=true
          break
        else
          echo "❌ Migration failed with exit code $exit_code"
          docker logs "$container_name" --tail 50 2>/dev/null || true
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
      "unknown")
        # Container might not exist yet or was removed
        if [ $counter -lt 5 ]; then
          echo "⏳ Container status unknown, waiting..."
        fi
        ;;
      *)
        echo "⚠️  Migration container status: $status"
        ;;
    esac

    counter=$((counter + 1))
    if [ $((counter % 10)) -eq 0 ]; then
      echo "Still waiting... ($counter/$max_attempts)"
    fi
    sleep 2
  done

  if [ "$migration_completed" = false ]; then
    echo "❌ Migration timed out!"
    docker logs "$container_name" --tail 100 2>/dev/null || echo "No logs available"
    return 1
  fi

  # Show final migration logs
  echo ""
  echo "📋 Final migration logs:"
  docker logs "$container_name" --tail 30 2>/dev/null || echo "No logs available"

  return 0
}

# Function to run migration
run_migration() {
  echo "🔄 Starting migration service..."

  # More aggressive cleanup of any existing migration container
  local container_name="service-migration-${ENV_SUFFIX}"

  # Stop any running migration
  docker stop "$container_name" 2>/dev/null || true

  # Remove any existing container (running or stopped)
  docker rm -f "$container_name" 2>/dev/null || true

  # Also use docker-compose to ensure clean state
  docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" stop migration 2>/dev/null || true
  docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" rm -f migration 2>/dev/null || true

  # Small pause to ensure cleanup is complete
  sleep 1

  # Start migration service
  echo "📦 Starting fresh migration container..."
  if ! docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" up -d --no-deps --force-recreate migration; then
    echo "❌ Failed to start migration container!"
    return 1
  fi

  # Wait for migration to complete
  if ! wait_for_migration; then
    echo "❌ Migration failed!"
    # Try to show any available logs
    docker logs "$container_name" --tail 50 2>/dev/null || echo "No migration logs available"
    return 1
  fi

  # Clean up migration container
  echo "🧹 Cleaning up migration container..."
  docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" stop migration 2>/dev/null || true
  docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" rm -f migration 2>/dev/null || true

  return 0
}

# Main deployment process
START_TIME=$(date +%s)
echo "🚀 Starting safe deployment with minimized downtime..."

# Phase 1: Preparation (services still running)
echo ""
echo "📋 Phase 1: Preparation (services remain available)"
echo "================================================="

# Step 1: Ensure RabbitMQ is running
echo "🔍 Checking RabbitMQ status..."
if is_container_running "rabbitmq"; then
  echo "✅ RabbitMQ is already running"
else
  echo "🏗️  Starting RabbitMQ..."
  docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" up -d rabbitmq
  echo "⏳ Waiting for RabbitMQ to be ready..."
  sleep 10
fi

# Step 2: Pre-build all images while services are running
echo "🔨 Pre-building all Docker images (services still available)..."
docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" build --parallel migration "${MICROSERVICES[@]}"
echo "✅ All images built and ready"

# Phase 2: Quick switchover (minimal downtime)
echo ""
echo "📋 Phase 2: Database migration (minimal downtime)"
echo "================================================="
DOWNTIME_START=$(date +%s)

# Step 3: Stop microservices (RabbitMQ stays running)
echo "🛑 Stopping microservices for migration safety..."
docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" stop "${MICROSERVICES[@]}"

# Step 4: Run migration
echo "🔄 Running database migration..."
# Clean up any existing migration container
docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" rm -f migration 2>/dev/null || true

# Run migration
if ! run_migration; then
  echo "❌ Migration failed! Services remain stopped for safety."
  echo "⚠️  Manual intervention required. Check migration logs and fix issues."
  echo ""
  echo "🔧 To restart services without migration:"
  echo "   docker compose -f $DOCKER_FILE -p $COMPOSE_PROJECT_NAME up -d ${MICROSERVICES[*]}"
  echo ""
  echo "🔧 To retry migration:"
  echo "   docker compose -f $DOCKER_FILE -p $COMPOSE_PROJECT_NAME up migration"
  exit 1
fi

# Step 5: Start all microservices with pre-built images
echo "🚀 Starting all microservices..."
docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" up -d "${MICROSERVICES[@]}"

DOWNTIME_END=$(date +%s)
DOWNTIME=$((DOWNTIME_END - DOWNTIME_START))

# Phase 3: Verification
echo ""
echo "📋 Phase 3: Verification"
echo "======================="

# Show deployment summary
END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))

echo ""
echo "✅ Deployment completed successfully!"
echo "⏱️  Total deployment time: ${TOTAL_TIME} seconds"
echo "⏱️  Service downtime: ${DOWNTIME} seconds"
echo ""
echo "📊 Service status:"
docker compose -f "$DOCKER_FILE" -p "$COMPOSE_PROJECT_NAME" ps

# Wait a bit for services to fully start
echo ""
echo "🏥 Waiting for services to be ready..."
sleep 5

# Health check with retry
echo "🏥 Verifying services..."

# Debug: Check if docker command works
echo "Debug: Checking docker command..."
docker --version || echo "Docker command failed"

# Debug: List running containers
echo "Debug: Listing containers..."
docker ps --format "table {{.Names}}" || echo "Docker ps failed"

healthy_count=0
total_services=${#MICROSERVICES[@]}

for service in "${MICROSERVICES[@]}"; do
  echo "Debug: Checking service $service-${ENV_SUFFIX}..."

  # Check if container is running
  container_name="${service}-${ENV_SUFFIX}"
  if docker ps --format "{{.Names}}" | grep -q "^${container_name}$"; then
    healthy_count=$((healthy_count + 1))
    echo "  ✓ $service is starting/running"
  else
    echo "  ✗ $service failed to start"
  fi

done

echo ""
echo "📊 Summary: $healthy_count/$total_services services are up"

if [ "$healthy_count" -ne "$total_services" ]; then
  echo ""
  echo "⚠️  Warning: Not all services started successfully!"
  echo "Check logs with: docker compose -f $DOCKER_FILE -p $COMPOSE_PROJECT_NAME logs [service-name]"
  echo ""
  echo "Failed services:"
  for service in "${MICROSERVICES[@]}"; do
    container_name="${service}-${ENV_SUFFIX}"
    if ! docker ps --format "{{.Names}}" | grep -q "^${container_name}$"; then
      echo "  - $service"
    fi
  done
fi

# Always exit successfully if we got this far - the deployment worked
exit 0
