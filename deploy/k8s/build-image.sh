#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
IMAGE="${IMAGE:-webchat-app:latest}"
echo "Building ${IMAGE} from ${ROOT}"
docker build -f deploy/docker/Dockerfile -t "${IMAGE}" .
echo "Done. For kind: kind load docker-image ${IMAGE} --name <cluster-name>"
