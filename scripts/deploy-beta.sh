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
readonly IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
readonly BACKEND_SOURCE="apps/api"
readonly SECRETS="DATABASE_URL=DATABASE_URL:latest,SARVAM_API_KEY=SARVAM_API_KEY:latest,GOOGLE_APPLICATION_CREDENTIALS=GOOGLE_APPLICATION_CREDENTIALS:latest"

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

# --- Build image via Cloud Build -------------------------
info "Building Docker image..."
gcloud builds submit \
  --project "${PROJECT_ID}" \
  --tag "${IMAGE}" \
  --dockerfile "${BACKEND_SOURCE}/Dockerfile" \
  .
info "Image built: ${IMAGE}"

# --- Deploy to Cloud Run ---------------------------------
info "Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --service-account "${SERVICE_ACCOUNT}" \
  --port 8080 \
  --add-cloudsql-instances evia-500215:asia-south1:evia-db \
  --set-secrets "${SECRETS}" \
  --min-instances 1 \
  --max-instances 4 \
  --allow-unauthenticated

info "Deploy successful!"
