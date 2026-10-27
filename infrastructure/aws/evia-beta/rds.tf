resource "aws_db_subnet_group" "main" {
  name        = "${var.name_prefix}-postgres"
  description = "Private subnets for the evia beta PostgreSQL instance"
  subnet_ids  = local.private_subnet_ids

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-postgres-subnet-group"
  })
}

resource "aws_db_parameter_group" "main" {
  name        = "${var.name_prefix}-postgres16"
  family      = "postgres16"
  description = "evia beta PostgreSQL 16 parameters"

  parameter {
    name  = "max_connections"
    value = "100"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-postgres16-params"
  })
}

resource "aws_db_instance" "main" {
  identifier = "${var.name_prefix}-postgres"
  engine     = "postgres"

  engine_version        = var.db_engine_version
  instance_class        = var.db_instance_class
  allocated_storage     = var.db_allocated_storage_gb
  max_allocated_storage = var.db_max_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.data.arn

  db_name  = var.db_name
  username = var.db_user
  password = random_password.db_password.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = var.db_multi_az

  parameter_group_name = aws_db_parameter_group.main.name

  backup_retention_period = var.db_backup_retention_days
  backup_window           = "19:00-19:30"
  maintenance_window      = "sun:20:45-sun:21:15"
  copy_tags_to_snapshot   = true

  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false
  apply_immediately           = false

  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.data.arn
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name_prefix}-postgres-final"

  tags = merge(local.common_tags, {
    Name               = "${var.name_prefix}-postgres"
    DataClassification = "sensitive"
  })
}
