#!/usr/bin/env bash
set -euo pipefail
REGION="${AWS_REGION:-us-east-1}"
CLUSTER="${EKS_CLUSTER:-webchat-demo}"
echo "Deleting EKS cluster $CLUSTER (stops billing)..."
eksctl delete cluster --name "$CLUSTER" --region "$REGION" --wait
echo "Done. Verify no orphaned EBS volumes in EC2 console."
