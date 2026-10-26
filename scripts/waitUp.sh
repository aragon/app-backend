#!/usr/bin/env bash

service_dns=$1
service_port=$2
max_tries=60

for ((try = 1; try <= max_tries; try++)); do
  if nc -z ${service_dns} ${service_port}; then
    exit 0
  fi
  echo "Waiting up for ${service_dns}..."
  sleep 2
done

echo "Gave up: ${service_dns}:${service_port} never came up after ${max_tries} tries"
exit 1
