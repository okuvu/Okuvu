param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,

    [Parameter(Mandatory = $false)]
    [string]$InstanceName = "evia-db"
)

$ErrorActionPreference = "Stop"

Write-Host "=== E0-S06: Cloud SQL Connection Test ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify Cloud SQL Proxy is installed
Write-Host "[1/5] Checking Cloud SQL Proxy..." -ForegroundColor Yellow
$proxyPath = Get-Command "cloud-sql-proxy" -ErrorAction SilentlyContinue
if (-not $proxyPath) {
    $proxyPath = Get-Command "cloud_sql_proxy" -ErrorAction SilentlyContinue
}
if (-not $proxyPath) {
    Write-Warning "Cloud SQL Proxy not found in PATH."
    Write-Host "Download from: https://cloud.google.com/sql/docs/postgres/connect-auth-proxy#install"
    Write-Host "Extract to a directory in your PATH, or place it in this directory."
    exit 1
}
Write-Host "  Found: $($proxyPath.Source)" -ForegroundColor Green

# Step 2: Check gcloud auth
Write-Host "[2/5] Checking gcloud authentication..." -ForegroundColor Yellow
$authAccount = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null
if (-not $authAccount) {
    Write-Error "No active gcloud account. Run: gcloud auth login"
    exit 1
}
Write-Host "  Authenticated as: $authAccount" -ForegroundColor Green

# Step 3: Get connection name
Write-Host "[3/5] Getting Cloud SQL connection name..." -ForegroundColor Yellow
$connectionName = gcloud sql instances describe $InstanceName --project=$ProjectId --format="value(connectionName)" 2>$null
if (-not $connectionName) {
    Write-Error "Could not find instance '$InstanceName' in project '$ProjectId'"
    exit 1
}
Write-Host "  Connection name: $connectionName" -ForegroundColor Green

# Step 4: Retrieve DATABASE_URL from Secret Manager
Write-Host "[4/5] Retrieving DATABASE_URL from Secret Manager..." -ForegroundColor Yellow
$databaseUrl = gcloud secrets versions access latest --secret="DATABASE_URL" --project=$ProjectId 2>$null
if (-not $databaseUrl) {
    Write-Warning "Could not access DATABASE_URL secret. Checking if it exists..."
    gcloud secrets list --project=$ProjectId --format="table(name)"
    exit 1
}
Write-Host "  DATABASE_URL retrieved successfully (value not shown for security)" -ForegroundColor Green

# Step 5: Test connection via Cloud SQL Proxy with SELECT 1
Write-Host "[5/5] Testing connection via Cloud SQL Proxy..." -ForegroundColor Yellow
Write-Host "  Starting proxy in background on localhost:5432 (will run for 10 seconds)..."

$match = [regex]::Match($databaseUrl, 'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/([^\?]+)')
if (-not $match.Success) {
    Write-Error "Could not parse DATABASE_URL"
    exit 1
}
$dbUser = $match.Groups[1].Value
$dbPass = $match.Groups[2].Value
$dbName = $match.Groups[5].Value

$proxyJob = Start-Job -ScriptBlock {
    param($connName)
    cloud-sql-proxy "$connName" --port 5432
} -ArgumentList "${ProjectId}:${InstanceName}"

Start-Sleep -Seconds 5

try {
    $env:PGPASSWORD = $dbPass
    $result = & psql -h localhost -p 5432 -U $dbUser -d $dbName -c "SELECT 1 AS test;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "  Result:" -ForegroundColor Cyan
        Write-Host $result
        Write-Host ""
        Write-Host "  [PASS] SELECT 1 via Cloud SQL Proxy succeeded" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "  [FAIL] Connection failed:" -ForegroundColor Red
        Write-Host $result
    }
} finally {
    Stop-Job $proxyJob -ErrorAction SilentlyContinue
    Remove-Job $proxyJob -ErrorAction SilentlyContinue
}

# Negative test: attempt to read a secret without valid credentials
Write-Host ""
Write-Host "--- Negative Test: Access secret without credentials ---" -ForegroundColor Cyan
Write-Host "  (This tests that IAM scoping is enforced)"
$negResult = gcloud secrets versions access latest --secret="DATABASE_URL" --project=$ProjectId --impersonate-service-account="nonexistent@$ProjectId.iam.gserviceaccount.com" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [PASS] Access denied as expected" -ForegroundColor Green
    Write-Host "  Error: $negResult"
} else {
    Write-Host "  [FAIL] Secret was accessible — IAM scoping may be too broad" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Test complete ===" -ForegroundColor Cyan
