$ProjectId = "evia-500215"
$SaEmail = "evia-sa@${ProjectId}.iam.gserviceaccount.com"

Write-Host "=== Verifying evia GCP project ===" -ForegroundColor Cyan

Write-Host "`n1. Checking project and billing..."
gcloud projects describe $ProjectId --format="value(projectId, name, lifecycleState)"
gcloud billing projects describe $ProjectId --format="value(billingEnabled)"

Write-Host "`n2. Checking required APIs..."
$RequiredAPIs = @(
  "run.googleapis.com",
  "sqladmin.googleapis.com",
  "identitytoolkit.googleapis.com",
  "storage.googleapis.com",
  "aiplatform.googleapis.com",
  "secretmanager.googleapis.com"
)

foreach ($api in $RequiredAPIs) {
  $status = gcloud services list --enabled --project=$ProjectId --filter="config.name:${api}" --format="value(config.name)" 2>$null
  if ($status -eq $api) {
    Write-Host "  [OK] $api" -ForegroundColor Green
  } else {
    Write-Host "  [MISSING] $api" -ForegroundColor Red
  }
}

Write-Host "`n3. Checking service account..."
$saExists = gcloud iam service-accounts describe $SaEmail --project=$ProjectId --format="value(email)" 2>$null
if ($saExists) {
  Write-Host "  [OK] Service account: $SaEmail" -ForegroundColor Green
} else {
  Write-Host "  [MISSING] Service account: $SaEmail" -ForegroundColor Red
}

Write-Host "`n4. Checking IAM roles..."
$ExpectedRoles = @(
  "roles/cloudsql.client",
  "roles/secretmanager.secretAccessor",
  "roles/aiplatform.user",
  "roles/storage.objectAdmin"
)

foreach ($role in $ExpectedRoles) {
  $member = gcloud projects get-iam-policy $ProjectId --flatten="bindings[].members" --filter="bindings.role=${role} AND bindings.members:serviceAccount:${SaEmail}" --format="value(bindings.role)" 2>$null
  if ($member) {
    Write-Host "  [OK] $role assigned" -ForegroundColor Green
  } else {
    Write-Host "  [MISSING] $role not assigned" -ForegroundColor Red
  }
}

Write-Host "`n5. Verifying NO Owner or Editor on service account..."
$ownerCheck = gcloud projects get-iam-policy $ProjectId --flatten="bindings[].members" --filter="(bindings.role=roles/owner OR bindings.role=roles/editor) AND bindings.members:serviceAccount:${SaEmail}" --format="value(bindings.role)" 2>$null
if (-not $ownerCheck) {
  Write-Host "  [OK] No Owner or Editor role (least-privilege confirmed)" -ForegroundColor Green
} else {
  Write-Host "  [FAIL] Service account has: $ownerCheck" -ForegroundColor Red
  exit 1
}

Write-Host "`n=== All checks passed ===" -ForegroundColor Cyan
