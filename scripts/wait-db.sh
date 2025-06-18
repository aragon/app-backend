#!/usr/bin/env bash

# Requires env var: MONGODB_URI
# Example: mongodb://user:pass@localhost:27017,localhost:27018,localhost:27019/dbname?replicaSet=rs0&authSource=admin

replica_uri="${MONGODB_URI#mongodb://}"

# Check if user:password@ is present
if [[ "$replica_uri" == *"@"* ]]; then
  # Remove everything up to and including "@"
  replica_uri="${replica_uri#*@}"
fi

# Remove everything after the first "/"
replica_uri="${replica_uri%%/*}"

# Split by ","
IFS=',' read -ra HOSTS <<< "$replica_uri"

for hostport in "${HOSTS[@]}"; do
  host=$(echo "$hostport" | cut -d ':' -f 1)
  port=$(echo "$hostport" | cut -d ':' -f 2)
  echo "🔍 Waiting for MongoDB node $host:$port..."
  until nc -z "$host" "$port"; do
    sleep 2
  done
  echo "✅ $host:$port is up"
done
