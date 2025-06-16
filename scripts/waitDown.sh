#!/usr/bin/env bash

service_dns=$1

function wait_down {

  if ping -c 1 ${service_dns} &> /dev/null ; then
    echo "Waiting down for ${service_dns}..."
    sleep 2
    wait_down
  fi

}

sleep 2

wait_down
