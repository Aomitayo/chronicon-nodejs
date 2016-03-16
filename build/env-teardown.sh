#! /usr/bin/env bash

project_name=chronicon
env_definition=$(dirname $0)/test-env.yml

# Destroy the docker environment
docker-compose -p $project_name -f $env_definition stop && \
docker-compose -p $project_name -f $env_definition rm -f
