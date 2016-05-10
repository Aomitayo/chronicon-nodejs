#! /usr/bin/env bash

project_name=chronicon
docker_compose_file=$(dirname $0)/docker-compose.yml

case "$1" in
	"setup")
		echo "setting up..."
		# create a docker environment to run the tests against
		docker-compose -p $project_name -f $docker_compose_file stop && \
		docker-compose -p $project_name -f $docker_compose_file rm -f && \
		docker-compose -p $project_name -f $docker_compose_file up -d

		sleep 5
		exit 0
		;;
	"teardown")
		echo "Tearing down..."
		# Destroy the docker environment
		docker-compose -p $project_name -f $docker_compose_file stop && \
		docker-compose -p $project_name -f $docker_compose_file rm -f
		;;
	"test")
		# Deduce Environment variables
		amqp_host=$(docker-compose -p $project_name -f $docker_compose_file port rabbitmq 5672|head -1|tr -s "\->" ":"|cut -d ':' -f 1| tr -d ' ')
		amqp_port=$(docker-compose -p $project_name -f $docker_compose_file port rabbitmq 5672|head -1|tr -s "\->" ":"|cut -d ':' -f 2| tr -d ' ')
		AMQP_URL="amqp://$amqp_host:$amqp_port"

		rethinkdb_host=$(docker-compose -p $project_name -f $docker_compose_file port rethinkdb 28015|head -1|tr -s "\->" ":"|cut -d ':' -f 1| tr -d ' ')
		rethinkdb_port=$(docker-compose -p $project_name -f $docker_compose_file port rethinkdb 28015|head -1|tr -s "\->" ":"|cut -d ':' -f 2| tr -d ' ')
		RETHINKDB_URL="rethinkdb://$rethinkdb_host:$rethinkdb_port"
		# wait for dust to settle
		sleep 5
		# run the tests
		AMQP_URL=$AMQP_URL RETHINKDB_URL=$RETHINKDB_URL mocha -t 10000 test/specs/*
		;;
	*)
		echo "Please choose a command"
		exit 1
		;;
esac
