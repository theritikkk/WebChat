#!/usr/bin/env bash
# Stop EC2 instance to avoid charges when not demoing (e.g. nights/weekends)
# Run via cron or manually. Requires IAM permission ec2:StopInstances on self.
set -euo pipefail

INSTANCE_ID=$(curl -sf http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -sf http://169.254.169.254/latest/meta-data/placement/availability-zone | sed 's/[a-z]$//')

echo "Stopping instance $INSTANCE_ID in $REGION..."
aws ec2 stop-instances --instance-ids "$INSTANCE_ID" --region "$REGION"
echo "Instance stopping. Remember to start it from AWS Console when needed."
