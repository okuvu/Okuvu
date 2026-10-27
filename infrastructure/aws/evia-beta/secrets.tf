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
