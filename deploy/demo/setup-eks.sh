#!/usr/bin/env bash
# Full EKS demo setup — run from repo root
# Prerequisites: aws cli, eksctl, kubectl, docker
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
CLUSTER="${EKS_CLUSTER:-webchat-demo}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> ECR login + create repos"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
for repo in webchat-app webchat-client webchat-worker webchat-uploads; do
  aws ecr describe-repositories --repository-names "$repo" --region "$REGION" 2>/dev/null || \
    aws ecr create-repository --repository-name "$repo" --region "$REGION"
done

echo "==> Build + push images"
docker build -f deploy/docker/Dockerfile -t "$ECR_REGISTRY/webchat-app:demo" .
docker build -f deploy/aws/nginx/Dockerfile -t "$ECR_REGISTRY/webchat-client:demo" .
docker build -f services/message-worker/Dockerfile -t "$ECR_REGISTRY/webchat-worker:demo" .
docker build -f services/uploads/Dockerfile -t "$ECR_REGISTRY/webchat-uploads:demo" .
docker push "$ECR_REGISTRY/webchat-app:demo"
docker push "$ECR_REGISTRY/webchat-client:demo"
docker push "$ECR_REGISTRY/webchat-worker:demo"
docker push "$ECR_REGISTRY/webchat-uploads:demo"

echo "==> EKS cluster"
if ! eksctl get cluster --name "$CLUSTER" --region "$REGION" 2>/dev/null; then
  eksctl create cluster -f deploy/eks/eksctl-cluster.yaml
fi
aws eks update-kubeconfig --name "$CLUSTER" --region "$REGION"

echo "==> Ingress + metrics-server"
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.3/deploy/static/provider/aws/deploy.yaml
kubectl wait -n ingress-nginx --for=condition=ready pod -l app.kubernetes.io/component=controller --timeout=300s
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml || true

echo "==> Deploy stack"
kubectl kustomize deploy/k8s/overlays/eks-demo | sed "s|REPLACE_ECR_REGISTRY|$ECR_REGISTRY|g" | kubectl apply -f -

echo "==> Wait for core deployments"
for dep in postgres mongo redis rabbitmq elasticsearch auth messages gateway chat client message-worker; do
  kubectl rollout status "deployment/$dep" -n webchat --timeout=600s 2>/dev/null || true
done

LB=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo ""
echo "=============================================="
echo " WebChat EKS demo is live"
echo " URL:  http://$LB"
echo ""
echo " Load test (300+ users):"
echo "   GATEWAY_URL=http://$LB CHAT_WS_URL=ws://$LB k6 run scripts/loadtest/k6-resume-demo.js"
echo ""
echo " Scale chat for video:"
echo "   kubectl scale deployment chat -n webchat --replicas=5"
echo "   kubectl get hpa -n webchat -w"
echo "=============================================="
