#!/bin/bash
set -e

export ETH_RPC_URL="${ETH_RPC_URL:-https://eth.llamarpc.com}"

COMPOSE_FILE="docker-compose-integration.yml"

# Tear down any previous run
docker compose -f $COMPOSE_FILE down -v --remove-orphans 2>/dev/null || true

# Start infra
docker compose -f $COMPOSE_FILE up -d --quiet-pull mongo1 mongo2 mongo3 rabbitmq anvil
docker compose -f $COMPOSE_FILE up mongo-init-replica

# Wait for Mongo
echo "Waiting for Mongo primary..."
until docker exec mongo1 mongosh --eval "rs.status().members.some(m => m.state === 1)" 2>/dev/null | grep -q true; do
  printf "."; sleep 2
done
echo " ✅ Mongo ready"

# Wait for Anvil
echo "Waiting for anvil fork (this may take a minute)..."
until curl -sf --max-time 5 -X POST http://localhost:8545 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; do
  printf "."; sleep 3
done
echo " ✅ Anvil ready"

# Get fork block and export for services
FORK_BLOCK=$(curl -sf -X POST http://localhost:8545 -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(parseInt(JSON.parse(d).result,16)))")
echo "Fork block: $FORK_BLOCK"
export NODES_ETHEREUM_MAINNET_FROM_BLOCK=$FORK_BLOCK

# Install forge dependencies if not present
if [ ! -d "test/integration/foundry/lib/forge-std" ]; then
  echo "Installing forge-std..."
  forge install foundry-rs/forge-std --no-git --root test/integration/foundry
fi

echo "✅ Infra ready. Run: yarn test:integration"