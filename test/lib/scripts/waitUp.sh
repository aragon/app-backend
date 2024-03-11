#!/usr/bin/env bash

service_dns=$1
service_port=$2

function wait_up {

  if ! nc -z ${service_dns} ${service_port}; then
    echo "Waiting up for ${service_dns}..."
    sleep 2
    wait_up
  fi

}

wait_up
