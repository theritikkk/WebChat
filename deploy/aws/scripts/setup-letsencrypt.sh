#!/usr/bin/env bash
# Issue Let's Encrypt cert via certbot (when NOT using Cloudflare origin SSL)
set -euo pipefail

DOMAIN="${1:?Usage: $0 chat.example.com admin@email.com}"
EMAIL="${2:?Usage: $0 chat.example.com admin@email.com}"
APP_DIR="${APP_DIR:-/opt/webchat}"

apt-get install -y certbot
mkdir -p "$APP_DIR/deploy/aws/nginx/ssl"

# Temporarily serve HTTP only for ACME
docker compose -f "$APP_DIR/deploy/aws/docker-compose.prod.yml" --env-file "$APP_DIR/.env.production" up -d nginx

certbot certonly --webroot \
  -w "$APP_DIR/deploy/aws/certbot-webroot" \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive

cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$APP_DIR/deploy/aws/nginx/ssl/"
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$APP_DIR/deploy/aws/nginx/ssl/"

docker compose -f "$APP_DIR/deploy/aws/docker-compose.prod.yml" --env-file "$APP_DIR/.env.production" restart nginx
echo "Certs installed. Add cron: 0 3 * * * certbot renew --quiet && docker compose ... restart nginx"
