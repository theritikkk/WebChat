#!/usr/bin/env bash
# One-time EC2 bootstrap — Ubuntu 22.04/24.04 ARM (t4g) or x86 (t3)
# Run as root: curl -fsSL ... | bash   OR   sudo bash bootstrap.sh
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

echo "==> System update"
apt-get update -y
apt-get upgrade -y

echo "==> Install dependencies"
apt-get install -y ca-certificates curl gnupg ufw fail2ban htop jq unzip

echo "==> Docker"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable docker
systemctl start docker

# Allow ubuntu/ec2-user to run docker
if id ubuntu &>/dev/null; then usermod -aG docker ubuntu; fi
if id ec2-user &>/dev/null; then usermod -aG docker ec2-user; fi

echo "==> Swap (critical for 1GB instances)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

echo "==> UFW firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

echo "==> Fail2Ban SSH"
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
EOF
systemctl enable fail2ban
systemctl restart fail2ban

echo "==> App directory"
mkdir -p /opt/webchat
chown -R ubuntu:ubuntu /opt/webchat 2>/dev/null || chown -R ec2-user:ec2-user /opt/webchat 2>/dev/null || true

echo "==> Bootstrap complete"
echo "Next: clone repo to /opt/webchat, copy .env.production, run deploy.sh"
