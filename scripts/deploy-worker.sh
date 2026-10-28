#!/usr/bin/env bash
set -euo pipefail

# =========================================================
# deploy-worker.sh — build apps/worker, push it to ECR, and roll the
# `evia-beta-worker` ECS Fargate service onto the new image.
#
# Mirrors infrastructure/aws/evia-beta:
#   ecr.tf → repository `evia-beta/worker`
#   ecs.tf → cluster `evia-beta`, service `evia-beta-worker`, container
#            `worker` (no load balancer; it polls SQS)
#   sqs.tf → queue `evia-beta-summary-jobs`
#
# Usage: ./scripts/deploy-worker.sh
#
# Environment:
#   AWS_REGION    (default ap-south-1)
#   NAME_PREFIX   (default evia-beta, must match variables.tf)
#   IMAGE_TAG     (default: git short SHA)
# =========================================================

readonly AWS_REGION="${AWS_REGION:-ap-south-1}"
readonly NAME_PREFIX="${NAME_PREFIX:-evia-beta}"
readonly CLUSTER="${NAME_PREFIX}"
readonly SERVICE="${NAME_PREFIX}-worker"
readonly WORKLOAD="worker"
readonly ECR_REPO="${NAME_PREFIX}/worker"
readonly WORKER_SOURCE="apps/worker"
readonly DOCKERFILE="${WORKER_SOURCE}/Dockerfile"

# Resolve project root (scripts/ is one level deep)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly NC='\033[0m'

fail() { echo -e "${RED}[FAIL]${NC} $*" >&2; exit 1; }
info() { echo -e "${GREEN}[INFO]${NC} $*"; }

TASK_DEF_JSON="$(mktemp)"
NEW_TASK_DEF="${TASK_DEF_JSON}.new"
trap 'rm -f "${TASK_DEF_JSON}" "${NEW_TASK_DEF}"' EXIT

# --- Pre-flight checks -----------------------------------
info "Running pre-flight checks..."

if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  fail "Uncommitted changes detected. Commit or stash before deploying."
fi

for bin in aws docker python3 git; do
  command -v "${bin}" >/dev/null 2>&1 || fail "${bin} not found on PATH."
done

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  fail "AWS credentials not available. Run: aws configure (or aws sso login)."
fi

AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
IMAGE="${ECR_REGISTRY}/${ECR_REPO}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short=12 HEAD)}"

[[ -f "${DOCKERFILE}" ]] || fail "Dockerfile not found at ${DOCKERFILE}"
[[ -n "${AWS_ACCOUNT_ID}" ]] || fail "Could not resolve the AWS account id."

info "Account ${AWS_ACCOUNT_ID} · region ${AWS_REGION} · cluster ${CLUSTER} · service ${SERVICE}"
info "Image ${IMAGE}:${IMAGE_TAG}"
info "All checks passed."

# --- Build and push to ECR --------------------------------
info "Logging in to ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}" >/dev/null

info "Building ${WORKLOAD} image..."
docker build \
  --platform linux/amd64 \
  -t "${IMAGE}:${IMAGE_TAG}" \
  -t "${IMAGE}:latest" \
  -f "${DOCKERFILE}" .

info "Pushing ${WORKLOAD} image to ECR..."
docker push "${IMAGE}:${IMAGE_TAG}"
docker push "${IMAGE}:latest"
info "Image pushed: ${IMAGE}:${IMAGE_TAG}"

# --- Register a new task definition revision --------------
info "Registering a new task definition revision for ${SERVICE}..."
aws ecs describe-task-definition \
  --task-definition "${SERVICE}" \
  --region "${AWS_REGION}" \
  --query 'taskDefinition' \
  --output json >"${TASK_DEF_JSON}"

# One shared implementation of the task-definition rewrite (also used by
# scripts/deploy-beta.sh and buildspec.yml).
python3 "${SCRIPT_DIR}/ecs-image-pin.py" \
  "${TASK_DEF_JSON}" "${NEW_TASK_DEF}" "${IMAGE}:${IMAGE_TAG}"

NEW_TASK_DEF_ARN="$(aws ecs register-task-definition \
  --cli-input-json "file://${NEW_TASK_DEF}" \
  --region "${AWS_REGION}" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)"
info "Registered ${NEW_TASK_DEF_ARN}"

# --- Roll the service -------------------------------------
info "Updating ${SERVICE} (force new deployment)..."
aws ecs update-service \
  --cluster "${CLUSTER}" \
  --service "${SERVICE}" \
  --task-definition "${NEW_TASK_DEF_ARN}" \
  --force-new-deployment \
  --region "${AWS_REGION}" >/dev/null

info "Waiting for ${SERVICE} to stabilise (this can take a few minutes)..."
if ! aws ecs wait services-stable \
  --cluster "${CLUSTER}" \
  --services "${SERVICE}" \
  --region "${AWS_REGION}"; then
  aws ecs describe-services \
    --cluster "${CLUSTER}" \
    --services "${SERVICE}" \
    --region "${AWS_REGION}" \
    --query 'services[0].events[:10].[createdAt,message]' \
    --output table || true
  fail "${SERVICE} did not stabilise — see the events above."
fi

aws ecs describe-services \
  --cluster "${CLUSTER}" \
  --services "${SERVICE}" \
  --region "${AWS_REGION}" \
  --query 'services[0].{service:serviceName,desired:desiredCount,running:runningCount,taskDefinition:taskDefinition}' \
  --output table

info "Deploy successful."
