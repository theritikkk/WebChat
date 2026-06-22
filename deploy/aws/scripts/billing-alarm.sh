#!/usr/bin/env bash
# AWS billing alarm — run once from your laptop with AWS CLI configured
# Requires: us-east-1 for billing metrics (AWS limitation)
set -euo pipefail

EMAIL="${1:?Usage: $0 you@email.com [threshold_usd]}"
THRESHOLD="${2:-5}"

echo "Creating SNS topic..."
TOPIC_ARN=$(aws sns create-topic --name webchat-billing-alarm --query TopicArn --output text 2>/dev/null || \
  aws sns list-topics --query "Topics[?contains(TopicArn,'webchat-billing')].TopicArn" --output text)

aws sns subscribe --topic-arn "$TOPIC_ARN" --protocol email --notification-endpoint "$EMAIL"

echo "Creating CloudWatch billing alarm (threshold: \$$THRESHOLD)..."
aws cloudwatch put-metric-alarm \
  --region us-east-1 \
  --alarm-name "WebChat-EstimatedCharges" \
  --alarm-description "Alert when AWS bill exceeds threshold" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --evaluation-periods 1 \
  --threshold "$THRESHOLD" \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=Currency,Value=USD \
  --alarm-actions "$TOPIC_ARN"

echo "Confirm the SNS subscription email, then you're protected."
echo "Also enable: AWS Console -> Billing -> Billing preferences -> Receive Billing Alerts"
