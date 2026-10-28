# Generated once, stored in state, and written to Secrets Manager. Nothing is
# hardcoded and no credential is committed. 24 alphanumeric characters avoids
# the characters PostgreSQL clients and connection URIs mangle.
resource "random_password" "db_password" {
  length  = 24
  special = false
}

resource "aws_secretsmanager_secret" "database" {
  name        = "${var.name_prefix}/database"
  description = "PostgreSQL credentials for the evia beta database"
  kms_key_id  = aws_kms_key.secrets.arn

  recovery_window_in_days = 7

  tags = merge(local.common_tags, {
    Name               = "${var.name_prefix}-database-credentials"
    DataClassification = "secret"
  })
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id

  secret_string = jsonencode({
    username     = var.db_user
    password     = random_password.db_password.result
    dbname       = var.db_name
    host         = aws_db_instance.main.address
    port         = aws_db_instance.main.port
    engine       = "postgres"
    # The full URI, password included. It used to be stored redacted ('***'),
    # which made it unusable as a container env var: the ECS task injects this
    # field straight into DATABASE_URL, Prisma then failed to authenticate and
    # the api exited 1. Redacting one field while `password` sits beside it in
    # the same secret protected nothing — anything that can read this JSON can
    # already read the password. The live secret was corrected by hand during
    # E16-S4; this keeps the next `terraform apply` from writing '***' back.
    database_url = "postgresql://${var.db_user}:${random_password.db_password.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}?sslmode=require"
  })
}

# Shared secret for API → worker task calls. Generated here rather than
# configured by hand so the two services cannot drift apart, and so no copy of
# it ever exists in a tfvars file.
resource "random_password" "worker_internal_auth" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "worker_internal_auth" {
  name        = "${var.name_prefix}/worker-internal-auth"
  description = "HMAC key authenticating API → worker task calls"
  kms_key_id  = aws_kms_key.secrets.arn

  recovery_window_in_days = 7

  tags = merge(local.common_tags, {
    Name               = "${var.name_prefix}-worker-internal-auth"
    DataClassification = "secret"
  })
}

resource "aws_secretsmanager_secret_version" "worker_internal_auth" {
  secret_id = aws_secretsmanager_secret.worker_internal_auth.id

  secret_string = jsonencode({
    secret = random_password.worker_internal_auth.result
  })
}

# -----------------------------------------------------------------------------
# Therapist portal secrets (portal.tf). NextAuth's signing key is generated here
# for the same reason as the worker key: a hand-set value in a tfvars file is a
# copy that can drift, and this one signs every session cookie.
# -----------------------------------------------------------------------------
resource "random_password" "nextauth_secret" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "nextauth_secret" {
  name        = "${var.name_prefix}/portal-nextauth-secret"
  description = "NextAuth session-cookie signing key for the therapist portal"
  kms_key_id  = aws_kms_key.secrets.arn

  recovery_window_in_days = 7

  tags = merge(local.common_tags, {
    Name               = "${var.name_prefix}-portal-nextauth-secret"
    DataClassification = "secret"
  })
}

resource "aws_secretsmanager_secret_version" "nextauth_secret" {
  secret_id = aws_secretsmanager_secret.nextauth_secret.id

  secret_string = jsonencode({
    secret = random_password.nextauth_secret.result
  })
}

# The therapist app client's own secret, republished under the name the task
# definition reads. Cognito owns the value; this is a projection, not a copy
# anyone has to keep in sync by hand.
resource "aws_secretsmanager_secret" "portal_cognito_client" {
  name        = "${var.name_prefix}/portal-cognito-client-secret"
  description = "Cognito therapist app-client secret (COGNITO_THERAPIST_CLIENT_SECRET)"
  kms_key_id  = aws_kms_key.secrets.arn

  recovery_window_in_days = 7

  tags = merge(local.common_tags, {
    Name               = "${var.name_prefix}-portal-cognito-client-secret"
    DataClassification = "secret"
  })
}

resource "aws_secretsmanager_secret_version" "portal_cognito_client" {
  secret_id = aws_secretsmanager_secret.portal_cognito_client.id

  secret_string = jsonencode({
    secret = aws_cognito_user_pool_client.portal.client_secret
  })
}

# Brevo key for the Add-Client wizard's invite emails. Empty by default: the
# wizard then shows the invite code on screen instead of emailing it, which is
# the documented graceful degradation.
resource "aws_secretsmanager_secret" "brevo" {
  name        = "${var.name_prefix}/brevo-api-key"
  description = "Brevo transactional-email API key used by the portal invite flow"
  kms_key_id  = aws_kms_key.secrets.arn

  recovery_window_in_days = 7

  tags = merge(local.common_tags, {
    Name               = "${var.name_prefix}-brevo-api-key"
    DataClassification = "secret"
  })
}

resource "aws_secretsmanager_secret_version" "brevo" {
  secret_id = aws_secretsmanager_secret.brevo.id

  secret_string = jsonencode({
    api_key = var.brevo_api_key
  })
}
