#!/usr/bin/env bash
set -euo pipefail

# =========================================================
# create-cleanup-scheduler.sh
# Creates (or updates) the daily session-limits cleanup job
# in Cloud Scheduler.
#
# Usage: ./scripts/create-cleanup-scheduler.sh [environment]
#   environment: dev (default) or beta
# =========================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# --- Environment config -----------------------------------
ENVIRONMENT="${1:-dev}"

case "${ENVIRONMENT}" in
  dev)
    PROJECT_ID="evia-dev"
    REGION="asia-south1"
    WORKER_URL="https://evia-worker-dev-xxxx-uc.a.run.app"
    SERVICE_ACCOUNT="evia-worker@evia-dev.iam.gserviceaccount.com"
    ;;
  beta)
    PROJECT_ID="evia-500215"
    REGION="asia-south1"
    WORKER_URL="https://evia-worker-${ENVIRONMENT}-xxxx-uc.a.run.app"
    SERVICE_ACCOUNT="evia-app@${PROJECT_ID}.iam.gserviceaccount.com"
    ;;
  *)
    echo "Usage: $0 [dev|beta]"
    exit 1
    ;;
esac

JOB_NAME="session-limits-cleanup"
SCHEDULE="0 2 * * *"
TIME_ZONE="Asia/Kolkata"
RETENTION_DAYS="30"
ENDPOINT="${WORKER_URL}/cleanup/session-limits?retention_days=${RETENTION_DAYS}"

# --- Pre-flight checks -----------------------------------
if ! command -v gcloud &>/dev/null; then
  echo "[FAIL] gcloud CLI not found."
  exit 1
fi

echo "[INFO] Environment: ${ENVIRONMENT}"
echo "[INFO] Project:     ${PROJECT_ID}"
echo "[INFO] Job name:    ${JOB_NAME}"
echo "[INFO] Endpoint:    ${ENDPOINT}"
echo "[INFO] Schedule:    ${SCHEDULE} (${TIME_ZONE})"

# --- Create or update the scheduler job -------------------
if gcloud scheduler jobs describe "${JOB_NAME}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" &>/dev/null; then
  echo "[INFO] Job '${JOB_NAME}' exists — updating..."
  gcloud scheduler jobs update http "${JOB_NAME}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --schedule="${SCHEDULE}" \
    --time-zone="${TIME_ZONE}" \
    --uri="${ENDPOINT}" \
    --http-method=POST \
    --oidc-service-account-email="${SERVICE_ACCOUNT}" \
    --oidc-token-audience="${WORKER_URL}/" \
    --description="Daily cleanup of session_limits rows older than ${RETENTION_DAYS} days"
else
  echo "[INFO] Job '${JOB_NAME}' does not exist — creating..."
  gcloud scheduler jobs create http "${JOB_NAME}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --schedule="${SCHEDULE}" \
    --time-zone="${TIME_ZONE}" \
    --uri="${ENDPOINT}" \
    --http-method=POST \
    --oidc-service-account-email="${SERVICE_ACCOUNT}" \
    --oidc-token-audience="${WORKER_URL}/" \
    --description="Daily cleanup of session_limits rows older than ${RETENTION_DAYS} days"
fi

echo "[SUCCESS] Scheduler job '${JOB_NAME}' configured."
