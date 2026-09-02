#!/usr/bin/env bash

set -e

echo "Stopping local infrastructure..."

docker compose down

echo "Removing unused containers..."
docker container prune -f

echo "Done."
