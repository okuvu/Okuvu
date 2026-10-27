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
