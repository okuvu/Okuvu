# =============================================================================
# Service discovery for the api → worker hop.
#
# apps/api refuses to start when it cannot reach the worker's /health
# (assertWorkerReachable, A1: no summary/memory worker means no continuity, so
# a half-up API must not serve traffic). The worker sits behind no load
# balancer, so it needs a stable private name; a Cloud Map namespace gives every
# worker task an A record in the VPC.
#
#   WORKER_URL = http://worker.<namespace>:<api_container_port>
# =============================================================================

resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${var.name_prefix}.local"
  description = "Private DNS for ${var.name_prefix} task-to-task calls"
  vpc         = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-namespace"
  })
}

resource "aws_service_discovery_service" "worker" {
  name = "worker"

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"

    dns_records {
      ttl  = 10
      type = "A"
    }
  }

  # Fargate tasks are healthy by ECS's own check; an extra Route 53 health check
  # would only add another moving part.
  health_check_custom_config {
    failure_threshold = 1
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-worker-discovery"
  })
}
