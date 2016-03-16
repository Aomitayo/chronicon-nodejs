#! /usr/bin/env bash

project_name=chronicon
env_definition=$(dirname $0)/test-env.yml

# create a docker environment to run the tests against
docker-compose -p $project_name -f $env_definition stop && \
docker-compose -p $project_name -f $env_definition rm -f && \
docker-compose -p $project_name -f $env_definition up -d
sleep 1

# Deduce Environment variables
host_ip=$(cut -d ':' -f 2 <<< $DOCKER_HOST | tr -d '/')
amqp_port=$(docker-compose -p $project_name -f $env_definition  port rabbitmq 5672)
amqp_port=$(cut -d ':' -f 2 <<< $amqp_port)
export AMQP_URL="amqp://$host_ip:$amqp_port"

rethinkdb_port=$(docker-compose -p $project_name -f $env_definition  port rethinkdb 28015)
rethinkdb_port=$(cut -d ':' -f 2 <<< $rethinkdb_port)
export RETHINKDB_URL="rethinkdb://$host_ip:$rethinkdb_port"

