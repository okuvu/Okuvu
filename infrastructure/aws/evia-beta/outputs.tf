output "vpc_id" {
  description = "ID of the evia beta VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs (ALB, NAT gateway)"
  value       = local.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs (ECS tasks, RDS, ElastiCache)"
  value       = local.private_subnet_ids
}

output "nat_gateway_ip" {
  description = "Elastic IP used for outbound traffic from private subnets"
  value       = aws_eip.nat.public_ip
}

output "alb_dns_name" {
  description = "DNS name of the public ALB"
  value       = aws_lb.api.dns_name
}

output "alb_url" {
  description = "HTTP URL of the api behind the ALB"
  value       = "http://${aws_lb.api.dns_name}"
}

output "api_target_group_arn" {
  description = "Target group the api service registers with"
  value       = aws_lb_target_group.api.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_names" {
  description = "ECS service names for api, worker and the therapist portal"
  value = {
    api    = aws_ecs_service.api.name
    worker = aws_ecs_service.worker.name
    portal = aws_ecs_service.portal.name
  }
}

output "portal_url" {
  description = "Public URL of the therapist portal (AWS-hosted; replaces any Vercel or GCP surface)"
  value       = local.portal_url
}

output "portal_service_name" {
  description = "ECS service that runs the therapist portal"
  value       = aws_ecs_service.portal.name
}

output "alb_hostnames" {
  description = "Hostnames that resolve to the ALB, and therefore the ones clients are configured with"
  value       = var.manage_dns ? local.alb_hostnames : []
}

output "route53_zone_nameservers" {
  description = "NS records to paste into the registrar for dns_zone_name; nothing resolves until they are delegated"
  value       = var.manage_dns ? aws_route53_zone.main[0].name_servers : []
}

output "ecr_repository_urls" {
  description = "ECR repository URLs keyed by workload"
  value       = { for name, repo in aws_ecr_repository.main : name => repo.repository_url }
}

output "rds_endpoint" {
  description = "RDS hostname:port (private, reachable only inside the VPC)"
  value       = aws_db_instance.main.endpoint
}

output "rds_identifier" {
  description = "RDS instance identifier"
  value       = aws_db_instance.main.identifier
}

output "database_secret_arn" {
  description = "Secrets Manager ARN holding the generated database credentials"
  value       = aws_secretsmanager_secret.database.arn
  sensitive   = true
}

output "redis_primary_endpoint" {
  description = "Valkey primary endpoint address"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "uploads_bucket_name" {
  description = "S3 bucket for user uploads"
  value       = aws_s3_bucket.uploads.id
}

output "uploads_bucket_arn" {
  description = "ARN of the uploads bucket"
  value       = aws_s3_bucket.uploads.arn
}

output "kms_key_arns" {
  description = "Customer-managed key ARNs by purpose"
  value = {
    contacts = aws_kms_key.contacts.arn
    data     = aws_kms_key.data.arn
    secrets  = aws_kms_key.secrets.arn
  }
}

output "summary_queue_url" {
  description = "SQS queue the api enqueues summary jobs onto"
  value       = aws_sqs_queue.summary.url
}

output "summary_queue_arn" {
  description = "ARN of the summary jobs queue"
  value       = aws_sqs_queue.summary.arn
}

output "summary_dlq_url" {
  description = "SQS dead-letter queue for summary jobs"
  value       = aws_sqs_queue.summary_dlq.url
}

output "log_group_names" {
  description = "CloudWatch log groups, one per workload (each matches its task definition's awslogs-group)"
  value = {
    api    = aws_cloudwatch_log_group.api.name
    worker = aws_cloudwatch_log_group.worker.name
    portal = aws_cloudwatch_log_group.portal.name
    flow   = aws_cloudwatch_log_group.flow.name
  }
}

output "alb_access_log_bucket" {
  description = "S3 bucket receiving ALB access logs"
  value       = aws_s3_bucket.alb_logs.id
}

output "budget_name" {
  description = "Name of the monthly budget alarm"
  value       = aws_budgets_budget.monthly.name
}

output "task_role_arns" {
  description = "Runtime IAM roles used by the api and worker tasks"
  value = {
    api    = aws_iam_role.api_task.arn
    worker = aws_iam_role.worker_task.arn
  }
}

output "execution_role_arn" {
  description = "Shared ECS execution role ARN"
  value       = aws_iam_role.ecs_execution.arn
}

output "cognito_client_pool_id" {
  description = "Cognito user pool id for mobile clients (COGNITO_USER_POOL_ID)"
  value       = aws_cognito_user_pool.clients.id
}

output "cognito_client_app_client_id" {
  description = "Cognito app client id the mobile app authenticates with (COGNITO_CLIENT_ID)"
  value       = aws_cognito_user_pool_client.mobile.id
}

output "cognito_therapist_pool_id" {
  description = "Cognito user pool id for therapists (COGNITO_THERAPIST_POOL_ID)"
  value       = aws_cognito_user_pool.therapists.id
}

output "cognito_therapist_app_client_id" {
  description = "Cognito app client id the therapist portal signs in with"
  value       = aws_cognito_user_pool_client.portal.id
}

output "cognito_therapist_client_secret" {
  description = "Cognito app client secret for the therapist portal (sensitive)"
  value       = aws_cognito_user_pool_client.portal.client_secret
  sensitive   = true
}

output "cognito_issuer" {
  description = "OIDC issuer for the therapist pool (COGNITO_ISSUER / NEXTAUTH)"
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.therapists.id}"
}

output "cognito_therapist_hosted_domain" {
  description = "Hosted domain serving the therapist pool's OAuth endpoints (the portal's sign-in page redirects here)"
  value       = "https://${aws_cognito_user_pool_domain.therapists.domain}.auth.${var.aws_region}.amazoncognito.com"
}
