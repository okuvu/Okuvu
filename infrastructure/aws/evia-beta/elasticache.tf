resource "aws_elasticache_subnet_group" "main" {
  name        = "${var.name_prefix}-cache"
  description = "Private subnets for the evia beta Valkey cluster"
  subnet_ids  = local.private_subnet_ids

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-cache-subnet-group"
  })
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.name_prefix}-cache"
  description          = "evia beta Valkey cache (sessions, rate limiting, job locks)"

  engine         = "valkey"
  engine_version = var.redis_engine_version
  node_type      = var.redis_node_type
  port           = var.redis_port

  # One node in beta: replication/failover needs at least two.
  num_cache_clusters         = var.redis_num_nodes
  automatic_failover_enabled = var.redis_num_nodes > 1
  multi_az_enabled           = var.redis_num_nodes > 1

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.data.arn
  transit_encryption_enabled = true

  snapshot_retention_limit = 1
  snapshot_window          = "19:30-20:30"
  maintenance_window       = "sun:21:00-sun:22:00"

  apply_immediately = true

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-cache"
  })
}
