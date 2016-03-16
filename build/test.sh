#! /usr/bin/env bash

project_name=chronicon
env_definition=$(dirname $0)/test-env.yml

# Deduce Environment variables
host_ip=$(cut -d ':' -f 2 <<< $DOCKER_HOST | tr -d '/')
amqp_port=$(docker-compose -p $project_name -f $env_definition  port rabbitmq 5672)
amqp_port=$(cut -d ':' -f 2 <<< $amqp_port)
AMQP_URL="amqp://$host_ip:$amqp_port"

rethinkdb_port=$(docker-compose -p $project_name -f $env_definition  port rethinkdb 28015)
rethinkdb_port=$(cut -d ':' -f 2 <<< $rethinkdb_port)
RETHINKDB_URL="rethinkdb://$host_ip:$rethinkdb_port"

# run the tests
AMQP_URL=$AMQP_URL RETHINDB_URL=$RETHINKDB_URL mocha -t 10000 test/specs/*
