#!/usr/bin/env bash
# Free local K8s demo (kind) — same manifests as EKS, no AWS cost
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

CLUSTER="${KIND_CLUSTER:-webchat}"

kind get clusters | grep -q "^${CLUSTER}$" || kind create cluster --name "$CLUSTER"

kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait -n ingress-nginx --for=condition=ready pod -l app.kubernetes.io/component=controller --timeout=180s

docker build -f deploy/docker/Dockerfile -t webchat-app:demo .
docker build -f deploy/aws/nginx/Dockerfile -t webchat-client:demo .
docker build -f services/message-worker/Dockerfile -t webchat-worker:demo .
docker build -f services/uploads/Dockerfile -t webchat-uploads:demo .

kind load docker-image webchat-app:demo --name "$CLUSTER"
kind load docker-image webchat-client:demo --name "$CLUSTER"
kind load docker-image webchat-worker:demo --name "$CLUSTER"
kind load docker-image webchat-uploads:demo --name "$CLUSTER"

kubectl kustomize deploy/k8s/base | \
  sed 's|webchat-app:latest|webchat-app:demo|g; s|webchat-client:latest|webchat-client:demo|g; s|webchat-worker:latest|webchat-worker:demo|g; s|webchat-uploads:latest|webchat-uploads:demo|g' | \
  kubectl apply -f -

kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml || true

echo "Waiting for rollouts..."
sleep 30
kubectl get pods -n webchat

echo ""
echo "Port-forward: kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8080:80"
echo "Open: http://localhost:8080"
echo "Load test: GATEWAY_URL=http://localhost:8080 CHAT_WS_URL=ws://localhost:8080 k6 run scripts/loadtest/k6-resume-demo.js"
