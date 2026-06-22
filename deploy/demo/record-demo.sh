#!/usr/bin/env bash
# Helper for resume video recording — run in split terminal while recording
set -euo pipefail

echo "=== WebChat Demo Recording Helper ==="
echo ""
echo "Terminal 1 (this): run commands below while screen recording"
echo "Terminal 2: watch pods"
echo "  watch -n2 'kubectl get pods -n webchat -o wide'"
echo ""

LB="${GATEWAY_URL:-$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null)}"
if [[ -n "$LB" && "$LB" != "null" ]]; then
  export GATEWAY_URL="http://$LB"
  export CHAT_WS_URL="ws://$LB"
  echo "Gateway: $GATEWAY_URL"
fi

read -p "Press Enter to show cluster overview..."
kubectl get nodes
kubectl get pods -n webchat
kubectl get hpa -n webchat
kubectl get ingress -n webchat

read -p "Press Enter to scale chat to 5 replicas..."
kubectl scale deployment chat -n webchat --replicas=5
kubectl rollout status deployment/chat -n webchat

read -p "Press Enter to run 300-user load test (k6)..."
if command -v k6 &>/dev/null; then
  k6 run scripts/loadtest/k6-resume-demo.js
else
  docker run --rm -i -e GATEWAY_URL -e CHAT_WS_URL grafana/k6 run - < scripts/loadtest/k6-resume-demo.js
fi

read -p "Press Enter to show HPA after load..."
kubectl get hpa -n webchat
kubectl top pods -n webchat 2>/dev/null || echo "(metrics-server warming up)"

echo ""
echo "Recording checklist:"
echo "  [ ] Browser: open $GATEWAY_URL — register, chat, upload"
echo "  [ ] Show 2 browser windows chatting in real time"
echo "  [ ] Terminal: pods scaling during k6"
echo "  [ ] Mention: Redis adapter, RabbitMQ worker, EKS HPA"
