param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,

    [Parameter(Mandatory = $true)]
    [string]$CloudRunServiceAccount,

    [Parameter(Mandatory = $true)]
    [string]$SarvamApiKey
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== E0-S06: Cloud SQL + Secret Manager Deployment ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project:          $ProjectId"
Write-Host "Region:           asia-south1"
Write-Host "Service Account:  $CloudRunServiceAccount"
Write-Host ""

# Step 1: Ensure required APIs are enabled
Write-Host "[1/5] Enabling required GCP APIs..." -ForegroundColor Yellow
$apis = @(
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com"
)
foreach ($api in $apis) {
    gcloud services enable $api --project=$ProjectId
}
Write-Host "[1/5] APIs enabled." -ForegroundColor Green

# Step 2: Verify the Cloud Run service account exists
Write-Host "[2/5] Verifying service account exists..." -ForegroundColor Yellow
$saCheck = gcloud iam service-accounts describe $CloudRunServiceAccount --project=$ProjectId 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Service account '$CloudRunServiceAccount' does not exist in project '$ProjectId'."
    Write-Error "Run E0-S05 (Provisions evia-beta GCP project) first, or create the SA manually:"
    Write-Error "  gcloud iam service-accounts create evia-beta-sa --project=$ProjectId"
    exit 1
}
Write-Host "[2/5] Service account confirmed: $CloudRunServiceAccount" -ForegroundColor Green

# Step 3: Create Terraform state bucket if it doesn't exist
Write-Host "[3/5] Ensuring Terraform state bucket exists..." -ForegroundColor Yellow
$stateBucket = "${ProjectId}-terraform-state"
$bucketExists = gsutil ls -p $ProjectId "gs://$stateBucket" 2>$null
if (-not $bucketExists) {
    gsutil mb -p $ProjectId -l asia-south1 "gs://$stateBucket"
    gsutil versioning set on "gs://$stateBucket"
    Write-Host "  Created bucket: gs://$stateBucket" -ForegroundColor Green
} else {
    Write-Host "  Bucket already exists: gs://$stateBucket" -ForegroundColor Green
}

# Step 4: Initialize and apply Terraform
Write-Host "[4/5] Running Terraform..." -ForegroundColor Yellow
Set-Location -LiteralPath $ScriptDir

terraform init -reconfigure `
    -backend-config="bucket=${stateBucket}" `
    -backend-config="prefix=cloud-sql"

terraform plan `
    -var="project_id=${ProjectId}" `
    -var="cloud_run_service_account=${CloudRunServiceAccount}" `
    -var="sarvam_api_key=${SarvamApiKey}" `
    -out=tfplan

terraform apply tfplan

Set-Location -LiteralPath (Split-Path -Parent $ScriptDir)
Write-Host "[4/5] Terraform apply complete." -ForegroundColor Green

# Step 5: Verify
Write-Host "[5/5] Verifying deployment..." -ForegroundColor Yellow
Write-Host ""
Write-Host "--- Cloud SQL Instances ---" -ForegroundColor Cyan
gcloud sql instances describe evia-db --project=$ProjectId --format="table(name, databaseVersion, region, tier, state, availabilityType)" 2>$null

Write-Host ""
Write-Host "--- Secret Manager Secrets ---" -ForegroundColor Cyan
gcloud secrets list --project=$ProjectId --format="table(name, replication.policy, createTime)"

Write-Host ""
Write-Host "=== Deployment complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Run the connection test: .\test-connection.ps1 -ProjectId $ProjectId"
Write-Host "2. The DATABASE_URL secret value is set in Secret Manager (not logged here)"
Write-Host "3. Update .env.example's CLOUD_SQL_CONNECTION_NAME when deploying E0-S07"
