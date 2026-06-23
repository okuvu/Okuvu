# evia-beta — GCP Project Provisioning

## Prerequisites

- `gcloud` CLI installed and authenticated
- `terraform` >= 1.6 installed
- Access to the GCP organization with Project Creator and Billing Account User roles
- Billing account ID from the GCP organization

## Setup

```bash
# 1. Authenticate with GCP
gcloud auth application-default login

# 2. Configure Terraform variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your billing account ID and org ID

# 3. Initialize Terraform
terraform init

# 4. Review the plan
terraform plan

# 5. Apply
terraform apply -auto-approve
```

## What it provisions

| Resource | Detail |
|---|---|
| Project | `evia-beta` (display name: Evia Beta) |
| APIs | Cloud Run, Cloud SQL Admin, Firebase Auth, Cloud Storage, Vertex AI, Secret Manager |
| Service Account | `evia-beta-sa` with least-privilege IAM (no Owner/Editor) |
| IAM Roles | Cloud SQL Client, Secret Manager Accessor, Vertex AI User, Storage Object Admin |
| Admin access | Granted to the user specified in `admin_user` |

## Verification

After applying, run:

```bash
gcloud config set project evia-beta
gcloud services list --enabled --project=evia-beta
```

Confirm all 6 required APIs appear in the output.

## Billing

If billing setup is blocked by organizational approval, escalate immediately — this is a blocking dependency for Sprint 2 WebSocket work.
