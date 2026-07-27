# WebChat: Local Testing & AWS Deployment Guide

A step-by-step guide for running WebChat locally and deploying to AWS EC2 instances.

---

## 1. Local Testing & Verification Walkthrough

### Step 1 — Prerequisites
Ensure you have the following installed on your machine:
- **Node.js**: v20 or later (`node -v`)
- **Docker & Docker Compose**: v2.20+ (`docker compose version`)

### Step 2 — Environment & Infrastructure Setup

```bash
# 1. Clone repo & navigate into directory
git clone https://github.com/theritikkk/WebChat.git
cd WebChat

# 2. Create environment file from template
cp .env.example .env

# 3. Start local infrastructure containers (Postgres, Mongo, Redis, RabbitMQ, Elasticsearch)
docker compose up -d postgres mongo redis rabbitmq elasticsearch

# 4. Install all monorepo dependencies
npm install
```

### Step 3 — Run Automated Integration Test Suite

Run the full automated test harness (22 integration tests covering Auth, Messages, single-instance Chat, and multi-pod Socket.io Redis Pub/Sub scaling):

```bash
# Start local Redis container (required for multi-instance socket scaling test)
docker compose up -d redis

# Run all 22 integration tests locally
npm test
```

**Expected Test Output**:
```
PASS services/auth/test/auth.test.js
PASS services/messages/test/messages.test.js
PASS services/chat/test/chat-multi-instance.test.js
PASS services/chat/test/chat.test.js

Test Suites: 4 passed, 4 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        ~4.2 s
```

### Step 4 — Run Full Application Locally

You can launch all 6 backend services and the React frontend concurrently:

```bash
# Launch Gateway, Auth, Messages, Chat services concurrently
npm run dev

# In a separate terminal, launch the React client app
npm run dev:client
```

Access points:
- **React Web Client**: [http://localhost:5173](http://localhost:5173)
- **API Gateway**: [http://localhost:4000/health](http://localhost:4000/health)
- **Socket.io Chat Service**: [http://localhost:5000/health](http://localhost:5000/health)

---

## 2. AWS EC2 Deployment Guide

Follow these steps to deploy WebChat to an AWS EC2 instance.

### Step 1 — Provision AWS EC2 Instance
1. **AMI**: Ubuntu 22.04 LTS (64-bit x86)
2. **Instance Type**: `t3.medium` (2 vCPU, 4GB RAM) or `t3.large`
3. **Security Group Rules**:
   - `SSH` (22) — My IP
   - `HTTP` (80) — Anywhere (`0.0.0.0/0`)
   - `HTTPS` (443) — Anywhere (`0.0.0.0/0`)
   - `Custom TCP` (4000) — API Gateway (Optional)
   - `Custom TCP` (5000) — Socket.io Chat Service (Optional)

### Step 2 — Instance Bootstrap & Docker Setup

Connect to your EC2 instance via SSH:

```bash
ssh -i "your-key.pem" ubuntu@<YOUR_EC2_PUBLIC_IP>
```

Install Docker, Docker Compose, and Git:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker ubuntu
newgrp docker
```

### Step 3 — Clone & Configure Production Environment

```bash
git clone https://github.com/theritikkk/WebChat.git
cd WebChat

# Copy production environment template
cp .env.example .env

# Generate a strong JWT secret key for production security guard
JWT_SECRET_KEY=$(openssl rand -hex 64)
sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET_KEY/" .env
sed -i "s/NODE_ENV=.*/NODE_ENV=production/" .env
```

### Step 4 — Launch Production Stack via Docker Compose

```bash
# Start all infrastructure and unified app containers
docker compose --profile app up -d

# Verify all containers are healthy
docker compose ps
```

### Step 5 — Verify AWS Production Deployment

```bash
# Gateway health check
curl -sf http://localhost:4000/health

# Chat health check
curl -sf http://localhost:5000/health
```
