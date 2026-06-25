#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="evia-500215"
SA_EMAIL="evia-sa@${PROJECT_ID}.iam.gserviceaccount.com"

echo "=== Verifying evia GCP project ==="

echo ""
echo "1. Checking project exists and billing is enabled..."
gcloud projects describe "${PROJECT_ID}" --format="value(projectId, name, lifecycleState)"
gcloud billing projects describe "${PROJECT_ID}" --format="value(billingEnabled)"

echo ""
echo "2. Checking required APIs are enabled..."
REQUIRED_APIS=(
  "run.googleapis.com"
  "sqladmin.googleapis.com"
  "identitytoolkit.googleapis.com"
  "storage.googleapis.com"
  "aiplatform.googleapis.com"
  "secretmanager.googleapis.com"
)

for api in "${REQUIRED_APIS[@]}"; do
  STATUS=$(gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name:${api}" --format="value(config.name)")
  if [ "${STATUS}" = "${api}" ]; then
    echo "  [OK] ${api}"
  else
    echo "  [MISSING] ${api}"
  fi
done

echo ""
echo "3. Checking service account exists..."
SA_EXISTS=$(gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT_ID}" --format="value(email)" 2>/dev/null || echo "")
if [ -n "${SA_EXISTS}" ]; then
  echo "  [OK] Service account: ${SA_EMAIL}"
else
  echo "  [MISSING] Service account: ${SA_EMAIL}"
fi

echo ""
echo "4. Checking IAM roles (least-privilege verification)..."
EXPECTED_ROLES=(
  "roles/cloudsql.client"
  "roles/secretmanager.secretAccessor"
  "roles/aiplatform.user"
  "roles/storage.objectAdmin"
)

for role in "${EXPECTED_ROLES[@]}"; do
  MEMBER=$(gcloud projects get-iam-policy "${PROJECT_ID}" --flatten="bindings[].members" --filter="bindings.role=${role} AND bindings.members:serviceAccount:${SA_EMAIL}" --format="value(bindings.role)" 2>/dev/null || echo "")
  if [ -n "${MEMBER}" ]; then
    echo "  [OK] ${role} assigned"
  else
    echo "  [MISSING] ${role} not assigned"
  fi
done

echo ""
echo "5. Verifying NO Owner or Editor on service account..."
OWNER_CHECK=$(gcloud projects get-iam-policy "${PROJECT_ID}" --flatten="bindings[].members" --filter="(bindings.role=roles/owner OR bindings.role=roles/editor) AND bindings.members:serviceAccount:${SA_EMAIL}" --format="value(bindings.role)" 2>/dev/null || echo "")
if [ -z "${OWNER_CHECK}" ]; then
  echo "  [OK] No Owner or Editor role on service account (least-privilege confirmed)"
else
  echo "  [FAIL] Service account has: ${OWNER_CHECK}"
  exit 1
fi

echo ""
echo "=== All checks passed ==="
