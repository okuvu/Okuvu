#!/usr/bin/env bash
set -euo pipefail

# =========================================================
# deploy-beta.sh - Build and deploy apps/api to Cloud Run
# Usage: ./scripts/deploy-beta.sh
# =========================================================

readonly PROJECT_ID="evia-500215"
readonly REGION="asia-south1"
readonly SERVICE_NAME="backend"
readonly SERVICE_ACCOUNT="evia-app@${PROJECT_ID}.iam.gserviceaccount.com"
readonly IMAGE="us-central1-docker.pkg.dev/${PROJECT_ID}/backend/${SERVICE_NAME}"
readonly BACKEND_SOURCE="apps/api"
readonly SECRETS="DATABASE_URL=DATABASE_URL:latest,SARVAM_API_KEY=SARVAM_API_KEY:latest"

LOAD_TEST_MODE=false

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

# --- Pre-flight checks -----------------------------------
info "Running pre-flight checks..."

if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  fail "Uncommitted changes detected. Commit or stash before deploying."
fi

if ! command -v gcloud &>/dev/null; then
  fail "gcloud CLI not found. Install from https://cloud.google.com/sdk"
fi

if ! gcloud auth print-access-token &>/dev/null; then
  fail "Not authenticated. Run: gcloud auth login && gcloud auth application-default login"
fi

current_project="$(gcloud config get-value project 2>/dev/null || true)"
if [[ "${current_project}" != "${PROJECT_ID}" ]]; then
  fail "Active gcloud project is '${current_project}', expected '${PROJECT_ID}'.
Run: gcloud config set project ${PROJECT_ID}"
fi

if [[ ! -f "${BACKEND_SOURCE}/Dockerfile" ]]; then
  fail "Dockerfile not found at ${BACKEND_SOURCE}/Dockerfile"
fi

info "All checks passed."

# Parse optional --load-test flag
if [[ "${1:-}" == "--load-test" ]]; then
  LOAD_TEST_MODE=true
  shift
fi

# --- Build image + run migrations via Cloud Build ---------
info "Submitting build to Cloud Build (includes prisma migrate deploy)..."
gcloud builds submit --config cloudbuild.yaml --project "${PROJECT_ID}" .
info "Image built, migrations applied, image pushed."

# --- Deploy to Cloud Run ---------------------------------
info "Deploying to Cloud Run..."

DEPLOY_ARGS=(
  --image "${IMAGE}"
  --region "${REGION}"
  --project "${PROJECT_ID}"
  --service-account "${SERVICE_ACCOUNT}"
  --port 8080
  --add-cloudsql-instances evia-500215:asia-south1:evia-db
  --set-secrets "${SECRETS}"
  --set-env-vars "SESSION_LIMIT_SD_DAILY=1,SESSION_LIMIT_TL_DAILY=2,FIREBASE_PROJECT_ID=evia-500215"
  --min-instances 1
  --max-instances 4
  --allow-unauthenticated
)

if [[ "${LOAD_TEST_MODE}" == "true" ]]; then
  DEPLOY_ARGS+=(
    --set-env-vars "LOAD_TEST_MODE=true"
    --update-secrets "LOAD_TEST_KEY=LOAD_TEST_KEY:latest"
  )
  info "Load test mode enabled — LOAD_TEST_MODE=true, LOAD_TEST_KEY from Secret Manager"
fi

gcloud run deploy "${SERVICE_NAME}" "${DEPLOY_ARGS[@]}"

info "Deploy successful!"
