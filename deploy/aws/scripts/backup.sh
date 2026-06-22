#!/usr/bin/env bash
# Backup Postgres + Mongo volumes to S3 (cheap: ~$0.023/GB/mo)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/webchat}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/aws/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_DIR="${BACKUP_DIR:-/opt/webchat/backups}"
S3_URI="${BACKUP_S3_URI:-s3://your-bucket/webchat-backups}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"

cd "$APP_DIR"
source "$ENV_FILE" 2>/dev/null || true
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)

echo "==> Postgres dump"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-webchat}" "${POSTGRES_DB:-webchat}" \
  | gzip > "$BACKUP_DIR/postgres-$STAMP.sql.gz"

echo "==> Mongo dump"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T mongo \
  mongodump --archive --gzip --db=webchat \
  > "$BACKUP_DIR/mongo-$STAMP.archive.gz"

if command -v aws &>/dev/null && [[ "$S3_URI" != s3://your-bucket/* ]]; then
  echo "==> Upload to S3"
  aws s3 sync "$BACKUP_DIR" "$S3_URI/" --exclude "*" --include "*-$STAMP*"
fi

echo "==> Local retention"
find "$BACKUP_DIR" -type f -mtime +"$RETAIN_DAYS" -delete

echo "Backup done: $STAMP"
