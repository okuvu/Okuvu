# evia beta — AWS stack (ap-south-1)

The evia beta target stack (post cutover). One root module, no child modules.
Local state unless the S3 backend block in `providers.tf` is enabled.

## Prerequisites

- Terraform >= 1.9
- AWS credentials with rights to create VPC, RDS, ElastiCache, S3, KMS, ECR,
  ECS/IAM, SQS, CloudWatch and Budgets resources (an admin role in the target
  account is the practical minimum for a first apply)
- An ACM certificate if you want HTTPS (optional; see `alb_certificate_arn`)

## Setup

```bash
cp terraform.tfvars.example terraform.tfvars   # optional, defaults are beta-shaped
terraform init
terraform plan
terraform apply
```

No credentials are needed for `terraform init -backend=false` / `terraform validate`.

## What it provisions

| Area | Detail |
|---|---|
| Network | VPC `10.20.0.0/16`, 2 public + 2 private subnets across `ap-south-1a/b`, single NAT gateway, IGW, 4 security groups |
| Database | RDS PostgreSQL 16, `db.t4g.small`, 20 GiB gp3 (autoscaling to 100), private subnets, storage encrypted with the `data` CMK, 7-day backups, deletion protection |
| Cache | ElastiCache for Valkey `cache.t4g.micro`, 1 node, private subnets, at-rest + in-transit encryption |
| Secrets | `random_password` (24 chars) → Secrets Manager `evia-beta/database` as a JSON payload (`database_url`, `username`, `password`, ...) |
| Storage | S3 uploads bucket: private, versioned, SSE-KMS (bucket key on), TLS-only and KMS-only bucket policy |
| Keys | 3 CMKs: `contacts` (column-level emergency-contact encryption), `data` (RDS/ElastiCache/S3), `secrets`; rotation on |
| Images | ECR `evia-beta/api`, `evia-beta/worker`, scan-on-push, lifecycle retention |
| Compute | ECS Fargate cluster + `api` (2 tasks, behind ALB) and `worker` (1 task, no LB) services; execution role separate from per-workload task roles |
| Messaging | SQS `evia-beta-summary-jobs` with DLQ redrive after 3 receives |
| Observability | CloudWatch log groups for both services, VPC flow logs, 2 ALB alarms, 2 RDS alarms, EventBridge task-stop rule → ops SNS topic (fires when a task dies while it should be running), monthly budget alarm at 250 USD. Container Insights is **disabled**: it cost $32.40/mo in custom metrics and its running-count alarm is replaced by the free task-stop rule (E15-S8) |
| CI/CD | CodeBuild project `evia-beta-build` (VPC-attached, builds `buildspec.yml`) plus a webhook that starts it on every push to `develop` and reports the result as a GitHub commit status |

## Image deployment

Terraform creates the repositories and task definitions but does not build images.
Push before the first service stabilises:

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region ap-south-1 \
  | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com"
docker build -t "$AWS_ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com/evia-beta/api:latest" .
docker push "$AWS_ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com/evia-beta/api:latest"
```

Until an image exists at `var.image_tag`, the ECS tasks cannot start.

## Continuous deployment (push to develop)

A push to `develop` now builds and deploys by itself. Terraform owns a
CodeBuild webhook (`aws_codebuild_webhook.main` in `pipeline.tf`) filtered to
`EVENT = PUSH` and `HEAD_REF = ^refs/heads/develop$`, so:

1. the push fires a GitHub webhook, which CodeBuild receives on its payload URL;
2. `evia-beta-build` starts with no human step — nobody runs
   `aws codebuild start-build`;
3. `buildspec.yml` builds the three images, pushes them to ECR, rolls the ECS
   services, and CodeBuild reports the result back to GitHub as a **commit
   status** on the pushed commit (`report_build_status = true` on the project
   source, which is why a red build shows on the commit rather than only in
   CloudWatch).

Other branches, tags and pull-request refs do **not** start builds: the filter
is a single branch pattern, not a wildcard.

Check the trigger from the CLI:

```bash
aws codebuild batch-get-projects --names evia-beta-build --region ap-south-1 \
  --query 'projects[0].webhook.{status:status,filterGroups:filterGroups,buildType:buildType}'
```

`status` must be `ACTIVE` and the filter group must contain
`{"type":"HEAD_REF","pattern":"^refs/heads/develop$"}`. `webhook: null` means the
trigger is gone and pushes are silently doing nothing.

### Pausing the trigger

If a bad change lands on `develop`, stop the bleeding first and diagnose second:

```bash
# Immediate: removes the GitHub hook and the trigger. The project, its role and
# its manual path are untouched, so a fixed commit can still be built by hand.
aws codebuild delete-webhook --project-name evia-beta-build --region ap-south-1

# Or keep it reproducible in code (preferred — state stays honest):
#   enable_webhook = false   in terraform.tfvars
terraform apply
```

Turning it back on is the same lever in reverse: `enable_webhook = true` and
apply, or re-apply after a manual `delete-webhook` (Terraform sees the drift and
recreates it). Never re-create the hook by hand in the GitHub UI — CodeBuild
needs its own secret and payload URL, and a hand-made hook silently fails.

## Verify

```bash
terraform output alb_url
curl -sS "$(terraform output -raw alb_url)/health"
aws rds describe-db-instances --db-instance-identifier evia-beta-postgres \
  --query 'DBInstances[0].[DBInstanceStatus,PubliclyAccessible]'
aws secretsmanager get-secret-value --secret-id evia-beta/database \
  --query SecretString --output text | jq 'keys'
```

`PubliclyAccessible` must be `false`; `/health` must return 200 once a healthy
task is registered.

## Notes / known gaps

- Single NAT gateway: cheap, but an AZ failure breaks egress for both private
  subnets. Use one NAT per AZ before prod.
- HTTP listener is created unconditionally; HTTPS needs `alb_certificate_arn`.
- The budget is account-wide. Filtering by `Project=okuvu` requires activating
  that tag as a cost allocation tag in Billing first.
- SNS email subscriptions stay `pending confirmation` until the recipient clicks
  the AWS email.
- The S3 state backend block in `providers.tf` is commented out; create the
  bucket and lock table before enabling it.
