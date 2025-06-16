#!/usr/bin/env bash
# Health check script for Aragon services
# Usage: bash scripts/check-health.sh [environment]

ENVIRONMENT="${1:-dev}"
COMPOSE_PROJECT_NAME="aragon-$ENVIRONMENT"

echo "🏥 Aragon Services Health Check"
echo "================================"
echo "Environment: $ENVIRONMENT"
echo "Project: $COMPOSE_PROJECT_NAME"
echo ""

# Services to check
SERVICES=(
  "service-aragon-api"
  "service-aragon-admin-api"
  "service-aragon-indexer"
  "service-aragon-dao"
  "service-aragon-plugins"
  "service-aragon-rates"
)

# Check Docker daemon
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker daemon is not running"
  exit 1
fi

# Overall status
all_healthy=true
running_count=0
total_count=${#SERVICES[@]}

echo "📊 Service Status:"
echo "─────────────────"

for service in "${SERVICES[@]}"; do
  container_name="${service}-${ENVIRONMENT}"

  # Check if container exists
  if ! docker ps -a --format "{{.Names}}" | grep -q "^${container_name}$"; then
    echo "❌ $service: Container not found"
    all_healthy=false
    continue
  fi

  # Get container status
  status=$(docker inspect -f '{{.State.Status}}' "$container_name" 2>/dev/null)
  health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no healthcheck{{end}}' "$container_name" 2>/dev/null)

  # Get restart count
  restart_count=$(docker inspect -f '{{.RestartCount}}' "$container_name" 2>/dev/null)

  # Format output based on status
  case "$status" in
    "running")
      ((running_count++))
      if [[ "$health" == "healthy" ]]; then
        echo "✅ $service: Running (healthy)"
      elif [[ "$health" == "starting" ]]; then
        echo "🟡 $service: Running (health: starting...)"
      elif [[ "$health" == "unhealthy" ]]; then
        echo "🔴 $service: Running (unhealthy!) - Restarts: $restart_count"
        all_healthy=false
      else
        echo "✅ $service: Running (no healthcheck)"
      fi
      ;;
    "exited")
      exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$container_name")
      echo "❌ $service: Exited (code: $exit_code) - Restarts: $restart_count"
      all_healthy=false
      ;;
    "restarting")
      echo "🔄 $service: Restarting - Restarts: $restart_count"
      all_healthy=false
      ;;
    *)
      echo "⚠️  $service: $status"
      all_healthy=false
      ;;
  esac
done

# Check RabbitMQ
echo ""
echo "📡 Dependencies:"
echo "────────────────"
rabbitmq_status=$(docker inspect -f '{{.State.Status}}' "rabbitmq-${ENVIRONMENT}" 2>/dev/null || echo "not found")
if [[ "$rabbitmq_status" == "running" ]]; then
  rabbitmq_health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no healthcheck{{end}}' "rabbitmq-${ENVIRONMENT}" 2>/dev/null)
  if [[ "$rabbitmq_health" == "healthy" ]]; then
    echo "✅ RabbitMQ: Running (healthy)"
  else
    echo "🟡 RabbitMQ: Running (health: $rabbitmq_health)"
  fi
else
  echo "❌ RabbitMQ: $rabbitmq_status"
  all_healthy=false
fi

# Summary
echo ""
echo "📈 Summary:"
echo "──────────"
echo "Services running: $running_count/$total_count"

if [[ "$all_healthy" == true ]] && [[ "$running_count" == "$total_count" ]]; then
  echo "✅ All services are healthy!"
else
  echo "⚠️  Some services need attention"
  echo ""
  echo "🔍 Troubleshooting tips:"
  echo "  • Check logs: docker compose -p $COMPOSE_PROJECT_NAME logs [service-name] --tail 50"
  echo "  • Restart service: docker compose -p $COMPOSE_PROJECT_NAME restart [service-name]"
  echo "  • Check resources: docker stats"
fi

# Optional: Check endpoints
echo ""
echo "🌐 API Endpoints:"
echo "────────────────"
if command -v curl &> /dev/null; then
  # Check main API
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null | grep -q "200"; then
    echo "✅ API (port 3000): Responding"
  else
    echo "❌ API (port 3000): Not responding"
  fi

  # Check admin API
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null | grep -q "200"; then
    echo "✅ Admin API (port 3001): Responding"
  else
    echo "❌ Admin API (port 3001): Not responding"
  fi
else
  echo "ℹ️  Install curl to check API endpoints"
fi

echo ""
echo "✨ Health check complete!"
