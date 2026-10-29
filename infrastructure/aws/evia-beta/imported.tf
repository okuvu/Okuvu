# =============================================================================
# Resources that exist in the beta account but were created by hand, and are
# therefore invisible to `terraform state list` until they are imported.
#
# Each block below is written from the live resource's own attributes, so the
# sequence is: write the block (this file) -> `terraform import` -> plan is
# clean. Nothing here may be applied before the import: a plan would otherwise
# try to create a second copy of a resource that already exists (S3/Secrets
# names would collide, and a budget with the same name is rejected outright).
#
# Import commands (run from infrastructure/aws/evia-beta, one at a time):
#
#   terraform import aws_secretsmanager_secret.android_upload_keystore \
#     arn:aws:secretsmanager:ap-south-1:562654496378:secret:evia-beta/android-upload-keystore-XU62yo
#
#   terraform import aws_budgets_budget.account_guardrail \
#     562654496378:account-guardrail-monthly
#
# The mail records that were adopted alongside these live in dns-mail.tf.
# =============================================================================

# -----------------------------------------------------------------------------
# Android release signing keystore, stored as a binary secret.
#
# Created outside Terraform on 2026-10-28 (the day the app was first signed) and
# referenced by the Play Store release process, not by any container. Only the
# secret *container* is adopted here: no aws_secretsmanager_secret_version is
# declared, on purpose. Terraform would otherwise need the keystore bytes in
# HCL or in a plan file, and the value is already backed up offline — the
# point of tracking this resource is that `state list` explains what the secret
# is and that nothing deletes it by accident, not that Terraform rotates it.
#
# tags are ignored: the secret carries no tags today, and local.common_tags is
# applied to every resource this provider manages, so without the ignore a plan
# would show a permanent in-place tag update that no one intends to apply.
# -----------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "android_upload_keystore" {
  name        = "evia-beta/android-upload-keystore"
  description = "Okuvu Android upload keystore (ai.okuvu.app) - RSA-4096 PKCS12 alias upload. Offline backup required."

  lifecycle {
    ignore_changes = [tags, tags_all]
  }
}

# -----------------------------------------------------------------------------
# Account-wide spend guardrail.
#
# Distinct from aws_budgets_budget.monthly (the beta stack's own $250 ceiling,
# which notifies the ops SNS topic): this one is a $300 account-level stop that
# notifies a human by email and exists to catch spend the stack budget cannot
# see. It was created by hand in the console on 2026-10-28, which is exactly the
# kind of untracked state this story is about.
#
# The subscriber address is written literally rather than reusing
# var.budget_notification_email: that variable is optional and defaults to "",
# so binding this budget to it would silently delete the only human alert path
# whenever the variable is left unset.
#
# tags are ignored for the same reason as the secret above (created without
# tags; default_tags would otherwise show an unapplied diff).
# -----------------------------------------------------------------------------
resource "aws_budgets_budget" "account_guardrail" {
  name         = "account-guardrail-monthly"
  budget_type  = "COST"
  limit_amount = "300.0"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # The live budget was created with include_credit = false; every other
  # cost_type is the provider default.
  cost_types {
    include_credit = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = "50"
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = ["Rajwant@suvoksystem.com"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = "80"
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = ["Rajwant@suvoksystem.com"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = "100"
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = ["Rajwant@suvoksystem.com"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = "100"
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = ["Rajwant@suvoksystem.com"]
  }

  lifecycle {
    ignore_changes = [tags, tags_all]
  }
}
