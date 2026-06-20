# WebChat — Ultra-Low-Cost AWS Deployment

Student-friendly Docker Compose deployment. **No EKS, no ALB, no NAT Gateway.**

Full guide: [docs/AWS_DEPLOYMENT.md](../../docs/AWS_DEPLOYMENT.md)

## Quick start

```bash
# On a fresh Ubuntu EC2 (t4g.small recommended)
sudo bash deploy/aws/scripts/bootstrap.sh

# Clone and configure
sudo git clone https://github.com/YOUR/WebChat.git /opt/webchat
cd /opt/webchat
cp deploy/aws/.env.production.example .env.production
nano .env.production   # IMPORTANT: Set JWT_SECRET (openssl rand -hex 64), domain, S3 keys

# Deploy
bash deploy/aws/scripts/deploy.sh

# Scale chat to 2 replicas
CHAT_REPLICAS=2 bash deploy/aws/scripts/deploy.sh
```

## Files

| Path | Purpose |
|------|---------|
| `docker-compose.prod.yml` | Production stack with memory limits |
| `nginx/` | Reverse proxy + React static build |
| `scripts/bootstrap.sh` | EC2 first-time setup |
| `scripts/deploy.sh` | Rolling deploy |
| `scripts/backup.sh` | Postgres/Mongo backup to S3 |
| `scripts/billing-alarm.sh` | AWS cost alert |
| `monitoring/prometheus.yml` | Lightweight metrics |
| `systemd/webchat.service` | Auto-start on boot |

## Recommended instance

**t4g.small** (ARM, 2 vCPU, 2 GB) — ~$6–12/mo depending on region and free tier.

## Cloudflare (free)

Point DNS to EC2 Elastic IP, enable proxy (orange cloud), SSL mode **Full**. No ALB or ACM needed.
