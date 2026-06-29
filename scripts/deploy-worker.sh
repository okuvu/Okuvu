#!/usr/bin/env bash
set -euo pipefail

# =========================================================
# deploy-worker.sh - Build and deploy apps/worker to Cloud Run
# Usage: ./scripts/deploy-worker.sh
# =========================================================

readonly PROJECT_ID="evia-500215"
readonly REGION="asia-south1"
readonly SERVICE_NAME="evia-worker"
readonly SERVICE_ACCOUNT="evia-app@${PROJECT_ID}.iam.gserviceaccount.com"
readonly IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
readonly WORKER_SOURCE="apps/worker"
readonly SECRETS="DATABASE_URL=DATABASE_URL:latest"

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

if [[ ! -f "${WORKER_SOURCE}/Dockerfile" ]]; then
  fail "Dockerfile not found at ${WORKER_SOURCE}/Dockerfile"
fi

info "All checks passed."

# --- Build image via Cloud Build -------------------------

# Create temp file
TMP_CONFIG=$(mktemp /tmp/cloudbuild-worker.yaml.XXXXXX)

# Write the configuration with logging set to CLOUD_LOGGING_ONLY
cat <<EOF > "$TMP_CONFIG"
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${IMAGE}', '-f', 'apps/worker/Dockerfile', '.']
images:
  - '${IMAGE}'
options:
  logging: CLOUD_LOGGING_ONLY
EOF

# Now run the build with the evia-app service account
gcloud builds submit . \
  --config="$TMP_CONFIG" \
  --service-account=projects/evia-500215/serviceAccounts/evia-app@evia-500215.iam.gserviceaccount.com

# Clean up
rm -f "$TMP_CONFIG"

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
  --min-instances 0 \
  --max-instances 4 \
  --no-allow-unauthenticated

info "Deploy successful!"
