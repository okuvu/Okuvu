# ============================================================
# Amazon Cognito — the identity provider for both surfaces
# ============================================================
#
# Replaces Firebase Auth. Two pools because the two audiences have nothing in
# common: clients authenticate with a phone number and an SMS one-time code;
# therapists authenticate with an email, a password and TOTP MFA, and never
# touch the mobile app's pool.
#
# Client (mobile) flow, as implemented by apps/mobile/lib/src/core/cognito_client.dart:
#   first sign-in   SignUp(phone)  → SMS code → ConfirmSignUp → InitiateAuth
#   returning       ForgotPassword → SMS code → ConfirmForgotPassword → InitiateAuth
# Both end in USER_PASSWORD_AUTH tokens; the password is a device-generated
# secret the user never sees, so the SMS code is what actually authenticates.
#
# The API verifies the resulting tokens offline against the pool JWKS
# (apps/api/src/lib/cognito-auth.ts) — it never calls Cognito per request.

resource "aws_cognito_user_pool" "clients" {
  name = "${var.name_prefix}-clients"

  # Phone number *is* the username: there is no email or password the client
  # ever types. auto_verified_attributes makes Cognito send the SMS code on
  # sign-up and refuse the account until it is confirmed.
  username_attributes      = ["phone_number"]
  auto_verified_attributes = ["phone_number"]

  # OTP-by-SMS is the only factor; do not ask for a second one.
  mfa_configuration = "OFF"

  username_configuration {
    # Clients are provisioned by the Add-Client wizard with E.164 numbers.
    case_sensitive = false
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 1
  }

  schema {
    name                     = "phone_number"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 8
      max_length = 20
    }
  }

  # Account recovery is the returning-user sign-in path (ForgotPassword →
  # ConfirmForgotPassword), so it must go through the verified phone.
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_phone_number"
      priority = 1
    }
  }

  sms_configuration {
    external_id    = "okuvu-clients-sms"
    sns_caller_arn = aws_iam_role.cognito_sms.arn
    # Ops note: SNS SMS delivery to Indian numbers requires TRAI DLT
    # registration of the sender/template. Cognito uses the SNS account-level
    # default sender unless one is registered; until then codes fail to deliver
    # (the API returns a Cognito error, it does not silently pass).
    sns_region = var.aws_region
  }

  # A pool holding clinical-account identities must not be deletable by a
  # stray `terraform destroy` / apply that removes the resource.
  deletion_protection = "ACTIVE"

  tags = merge(local.common_tags, {
    Name               = "${var.name_prefix}-clients"
    DataClassification = "personal"
  })
}

resource "aws_cognito_user_pool_client" "mobile" {
  name         = "${var.name_prefix}-mobile"
  user_pool_id = aws_cognito_user_pool.clients.id

  # Public mobile client: a secret shipped in an APK is not a secret.
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH", # SignUp/Confirm + ForgotPassword end here
    "ALLOW_REFRESH_TOKEN_AUTH", # getIdToken() refresh path
  ]

  # Short access tokens, long refresh tokens: the refresh token is the device
  # credential, the access token is what the API sees on every call.
  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Do not reveal whether a phone number has an account.
  prevent_user_existence_errors = "ENABLED"

  enable_token_revocation = true
}

resource "aws_cognito_user_pool" "therapists" {
  name = "${var.name_prefix}-therapists"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Clinical-staff accounts: a second factor is optional but supported, and
  # the portal's sign-in page tells therapists to enrol one.
  mfa_configuration = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  password_policy {
    minimum_length                   = 14
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 3
  }

  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 5
      max_length = 254
    }
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  deletion_protection = "ACTIVE"

  tags = merge(local.common_tags, {
    Name               = "${var.name_prefix}-therapists"
    DataClassification = "personal"
  })
}

resource "aws_cognito_user_pool_client" "portal" {
  name         = "${var.name_prefix}-portal"
  user_pool_id = aws_cognito_user_pool.therapists.id

  # Confidential client: the NextAuth server holds this secret, never the
  # browser. Injected into the portal's environment as
  # COGNITO_THERAPIST_CLIENT_SECRET.
  generate_secret = true

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  allowed_oauth_flows_user_pool_client = true
  supported_identity_providers         = ["COGNITO"]

  # localhost for development, plus the deployed portal URL so the same client
  # works in the browser and in the ECS service.
  callback_urls = concat(var.portal_callback_urls, ["${local.portal_url}/api/auth/callback/cognito"])
  logout_urls   = concat(var.portal_logout_urls, [local.portal_url])

  # Same 12-hour working-day session the portal enforces in NextAuth.
  access_token_validity  = 12
  id_token_validity      = 12
  refresh_token_validity = 1

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true
}

# ============================================================
# SMS delivery role
# ============================================================

data "aws_iam_policy_document" "cognito_sms_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["cognito-idp.amazonaws.com"]
    }

    # Confused-deputy guard: only Cognito pools in this account may assume the
    # role. The pool ARN itself cannot be referenced here — the pool references
    # this role's ARN for sms_configuration, so a direct reference is a
    # Terraform dependency cycle.
    condition {
      test     = "StringLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cognito-idp:${var.aws_region}:${data.aws_caller_identity.current.account_id}:userpool/*"]
    }
  }
}

resource "aws_iam_role" "cognito_sms" {
  name               = "${var.name_prefix}-cognito-sms"
  assume_role_policy = data.aws_iam_policy_document.cognito_sms_assume.json

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-cognito-sms" })
}

data "aws_iam_policy_document" "cognito_sms_publish" {
  statement {
    sid       = "SendOtpSms"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = ["*"]

    # Restrict to SMS, not arbitrary SNS topics.
    condition {
      test     = "StringEquals"
      variable = "sns:Protocol"
      values   = ["sms"]
    }
  }
}

resource "aws_iam_role_policy" "cognito_sms_publish" {
  name   = "${var.name_prefix}-cognito-sms-publish"
  role   = aws_iam_role.cognito_sms.id
  policy = data.aws_iam_policy_document.cognito_sms_publish.json
}
