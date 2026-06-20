#!/usr/bin/env bash
# Rolling deploy with minimal downtime (student EC2 / Docker Compose)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/webchat}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/aws/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
CHAT_REPLICAS="${CHAT_REPLICAS:-2}"
PROFILES="${PROFILES:-}"
# PROFILES="--profile monitoring" or "--profile search --profile monitoring"

cd "$APP_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from deploy/aws/.env.production.example"
  exit 1
fi

echo "==> Pull latest code"
git fetch --all
git checkout "${DEPLOY_REF:-main}"
git pull origin "${DEPLOY_REF:-main}"

echo "==> Build images"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $PROFILES build --pull

echo "==> Migrate infra (databases stay up)"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $PROFILES up -d postgres mongo redis rabbitmq

echo "==> Wait for databases"
sleep 10

echo "==> Rolling app update"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $PROFILES up -d \
  auth messages message-worker uploads gateway

echo "==> Scale chat (Redis adapter handles fan-out)"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $PROFILES up -d --scale chat="$CHAT_REPLICAS" --no-recreate chat

echo "==> Update nginx (rebuild includes fresh client bundle)"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $PROFILES up -d nginx

echo "==> Prune old images (save disk)"
docker image prune -f

echo "==> Health check"
sleep 5
curl -sf http://127.0.0.1/ -o /dev/null || curl -sfk https://127.0.0.1/ -o /dev/null
curl -sf http://127.0.0.1/api/v1/auth/login -X POST -H 'Content-Type: application/json' -d '{}' | grep -q error || true

echo "Deploy complete."
