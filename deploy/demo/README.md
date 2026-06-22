# Demo Deployment Scripts

Record a resume video showing **300+ concurrent users** on a scaled Kubernetes cluster.

| Script | Purpose |
|--------|---------|
| `setup-eks.sh` | Create EKS + push ECR images + deploy (~$1–2 for a few hours) |
| `setup-kind.sh` | Free local kind cluster (same K8s manifests) |
| `record-demo.sh` | Guided commands while screen recording |
| `teardown-eks.sh` | Delete EKS cluster — stop billing |

Full guide: [docs/RESUME_DEMO.md](../../docs/RESUME_DEMO.md)

## Quick start (EKS)

```bash
bash deploy/demo/setup-eks.sh
bash deploy/demo/record-demo.sh
bash deploy/demo/teardown-eks.sh   # when done
```

## Quick start (free, local)

```bash
bash deploy/demo/setup-kind.sh
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8080:80
```
