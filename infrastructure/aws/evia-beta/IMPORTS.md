# Adopting the hand-created beta resources into Terraform

Runbook for E15-S5. Everything here is executed by whoever owns the state, from
`infrastructure/aws/evia-beta`, in this order.

**Backend: local, not remote.** `providers.tf` keeps the `backend "s3"` block
commented out because neither `okuvu-terraform-state` nor
`okuvu-terraform-locks` exists (checked: the account holds exactly two S3
buckets, both of them stack buckets). That means the state file is
`infrastructure/aws/evia-beta/terraform.tfstate` on one machine — gitignored, no
locking, no backup beyond the `.backup` sibling. Imports below must run in the
same working copy that holds the current state (serial 268, lineage
`7dd7f7f3…`, written by Terraform 1.9.8); running them anywhere else will import
into an empty state and leave the real one behind. This is the single biggest
hazard in this story, and it is why the state bucket is worth creating before
anyone else touches the stack.

## 1. Before touching anything

```bash
cd infrastructure/aws/evia-beta
cp terraform.tfstate "terraform.tfstate.pre-import-$(date -u +%Y%m%dT%H%M%SZ)"
terraform state list | wc -l          # 163 on 2026-10-29
terraform plan -detailed-exitcode     # must exit 0 before you start
```

## 2. Import the resources that already exist (6 addresses)

Each of these is declared in `imported.tf` / `dns-mail.tf` and written from the
live resource's own attributes, so the plan must stay clean afterwards.

```bash
# Android release keystore (secret container only — no version is managed,
# so the keystore value never enters HCL, state, or a plan file)
terraform import aws_secretsmanager_secret.android_upload_keystore \
  arn:aws:secretsmanager:ap-south-1:562654496378:secret:evia-beta/android-upload-keystore-XU62yo

# Account-level $300 spend guardrail (distinct from the stack's own budget)
terraform import aws_budgets_budget.account_guardrail \
  562654496378:account-guardrail-monthly

# Google Workspace mail records in the okuvu.in zone
terraform import 'aws_route53_record.mail["okuvu.in-MX"]' \
  Z04967962T87OWS0AZZBZ_okuvu.in_MX
terraform import 'aws_route53_record.mail["okuvu.in-TXT"]' \
  Z04967962T87OWS0AZZBZ_okuvu.in_TXT
terraform import 'aws_route53_record.mail["_dmarc.okuvu.in-TXT"]' \
  Z04967962T87OWS0AZZBZ__dmarc.okuvu.in_TXT
terraform import 'aws_route53_record.mail["google._domainkey.okuvu.in-TXT"]' \
  Z04967962T87OWS0AZZBZ_google._domainkey.okuvu.in_TXT
```

## 3. Remove the throwaways instead of adopting them

`evia-beta-conn-test` exists only to prove the CodeConnections GitHub connection
clones; its own description reads *"Throwaway … Delete after use."* Adopting it
would put a dead diagnostic project under change control forever, so delete it:

```bash
aws codebuild delete-project --name evia-beta-conn-test --region ap-south-1
aws logs delete-log-group --log-group-name /aws/codebuild/evia-beta-conn-test --region ap-south-1
```

## 4. Verify

```bash
terraform plan -detailed-exitcode    # expect exit 0
terraform state list | wc -l         # expect 169 (163 + 6)
```

If a TXT record shows an in-place update instead of no-op, stop and do not
apply: that would be quote normalisation on a live DKIM/SPF record. Report it
rather than pushing through.

## Not adopted, on purpose

| Resource | Why it stays outside state |
|---|---|
| `/aws/ecs/containerinsights/evia-beta/performance`, `/aws/rds/instance/evia-beta-postgres/postgresql` log groups | Created by ECS and RDS themselves, not by hand. Terraform owning them means a destroy could remove a log group a live service writes into. |
| `evia-beta/therapists/{ananya.rao,priya.nair,rohan.mehta}/password` (SSM, SecureString) | Seeded test-fixture passwords. Values are secrets; a Terraform resource would put them in HCL and state for no infrastructure benefit. |
| `evia-beta-dbprobe:1–32`, `evia-beta-bedrock-probe:1` task definitions | Hand-registered, now INACTIVE, and ECS keeps revoked revisions permanently — they cannot be deleted, and importing 33 dead revisions would be worse than leaving them. Listed here so they are not mistaken for drift later. |
| Superseded `evia-beta-{api,worker,portal}` task-definition revisions | Registered by the deploy pipeline, not by hand. One revision per family is tracked; history is not Terraform's to own. |
| Default VPC `172.31.0.0/16` + its default security group | Account defaults created by AWS. |
| CodeConnections connection `Okuvu` | Needs an interactive GitHub OAuth handshake; passed in as `var.codestar_connection_arn` instead. |
| `keel-deploy*` IAM role/policy | The deploy identity this session itself runs as — account plumbing, not the beta stack. |
