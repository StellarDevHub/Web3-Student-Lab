#!/usr/bin/env bash

set -e

# CI validation mode
if [[ "$1" == "--check" ]]; then
    echo "Checking Docker installation..."

    if ! command -v docker >/dev/null 2>&1; then
        echo "Docker is not installed."
        exit 1
    fi

    if ! docker compose version >/dev/null 2>&1; then
        echo "Docker Compose is unavailable."
        exit 1
    fi

    echo "Environment check passed."
    exit 0
fi

echo "Checking Docker..."

if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed."
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon is not running."
    exit 1
fi

echo "Starting local infrastructure..."

docker compose up -d db redis stellar-node

echo "Waiting for services..."

sleep 10

echo "Checking services..."

docker compose ps

curl --silent http://localhost:8000 >/dev/null || true

echo ""
echo "Local infrastructure is ready."
echo "Postgres : localhost:5432"
echo "Redis    : localhost:6380"

echo "Done."
