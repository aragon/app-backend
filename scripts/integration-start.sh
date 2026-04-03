#!/bin/bash
set -e

export ETH_RPC_URL="${ETH_RPC_URL:-https://eth.llamarpc.com}"

COMPOSE_FILE="docker-compose-integration.yml"

docker compose -f $COMPOSE_FILE down -v --remove-orphans 2>/dev/null || true

docker compose -f $COMPOSE_FILE up -d --quiet-pull mongo1 mongo2 mongo3 rabbitmq anvil
docker compose -f $COMPOSE_FILE up mongo-init-replica

echo "Waiting for Mongo primary..."
until docker exec mongo1 mongosh --eval "rs.status().members.some(m => m.state === 1)" 2>/dev/null | grep -q true; do
  printf "."; sleep 2
done
echo " ✅ Mongo ready"

echo "Waiting for anvil fork (this may take a minute)..."
ANVIL_TIMEOUT=120
ANVIL_ELAPSED=0
until curl -sf --max-time 5 -X POST http://localhost:8545 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; do
  printf "."; sleep 3
  ANVIL_ELAPSED=$((ANVIL_ELAPSED + 3))
  if [ $ANVIL_ELAPSED -ge $ANVIL_TIMEOUT ]; then
    echo " ❌ Anvil timed out after ${ANVIL_TIMEOUT}s"
    docker compose -f $COMPOSE_FILE logs anvil 2>&1 | grep -v "fork-url\|--fork\|dkey"
    exit 1
  fi
done
echo " ✅ Anvil ready"

if [ ! -d "test/integration/foundry/lib/forge-std" ]; then
  echo "Installing forge-std..."
  forge install foundry-rs/forge-std --no-git --root test/integration/foundry
fi

echo "✅ Infra ready. Run: yarn test:integration"
