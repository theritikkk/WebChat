# Deployment

## Kubernetes (recommended path)

See **[docs/KUBERNETES.md](../docs/KUBERNETES.md)** for architecture, kind/minikube steps, Ingress, scaling chat with Redis, and a production checklist.

Quick build from repo root:

```bash
./deploy/k8s/build-image.sh
```

Apply:

```bash
kubectl apply -k deploy/k8s/base
```

## AWS EC2 (low-cost, ~$6–15/mo)

See **[docs/AWS_DEPLOYMENT.md](../docs/AWS_DEPLOYMENT.md)** for step-by-step EC2 + Docker Compose deployment.

```bash
sudo bash deploy/aws/scripts/bootstrap.sh
bash deploy/aws/scripts/deploy.sh
```

## EKS Demo (resume video, ~$1–2 total)

See **[docs/RESUME_DEMO.md](../docs/RESUME_DEMO.md)** for one-command EKS setup and recording guide.

```bash
bash deploy/demo/setup-eks.sh
bash deploy/demo/record-demo.sh
bash deploy/demo/teardown-eks.sh
```

## Local Docker Compose (databases only)

```bash
docker compose up -d postgres mongo redis rabbitmq elasticsearch
npm run dev          # backend services
npm run dev:client   # React client
```

Backend services run on the host; Compose provides PostgreSQL, MongoDB, Redis, RabbitMQ, and Elasticsearch.

## Full stack via Docker Compose

```bash
docker compose --profile app up -d
```

This starts all application services (gateway, auth, messages, chat, worker, uploads, client) plus infrastructure.
