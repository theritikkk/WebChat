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

## Local Docker Compose (databases only)

```bash
docker compose up -d
npm run dev
```

Backend services still run on the host; Compose provides Postgres, Mongo, and Redis.
