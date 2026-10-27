resource "aws_ecs_cluster" "main" {
  name = var.name_prefix

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-cluster"
  })
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = 0
    weight            = 1
  }
}

locals {
  api_secrets = [
    {
      name      = "DATABASE_URL"
      valueFrom = "${aws_secretsmanager_secret.database.arn}:database_url::"
    },
    {
      # Shared HMAC key for API → worker task calls over the internal ALB.
      name      = "WORKER_INTERNAL_AUTH_SECRET"
      valueFrom = "${aws_secretsmanager_secret.worker_internal_auth.arn}:secret::"
    },
  ]

  shared_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "ENVIRONMENT", value = var.environment },
    { name = "LOG_LEVEL", value = "info" },
    { name = "AWS_REGION", value = var.aws_region },
    { name = "S3_UPLOADS_BUCKET", value = aws_s3_bucket.uploads.id },
    { name = "SQS_SUMMARY_QUEUE_URL", value = aws_sqs_queue.summary.url },
    # ioredis takes a URI; the rediss:// scheme enables TLS, which matches
    # transit_encryption_enabled on the replication group.
    { name = "REDIS_URL", value = "rediss://${aws_elasticache_replication_group.main.primary_endpoint_address}:${var.redis_port}" },
    { name = "CONTACTS_KMS_KEY_ARN", value = aws_kms_key.contacts.arn },

    # Models: Bedrock in-region. Nova Pro + Titan Embeddings V2 are the only
    # pair that keeps inference inside ap-south-1 (DPDP residency).
    # LLM_PROVIDER=bedrock is the production backend; leaving it unset would
    # silently route clinical prompts to OpenRouter over the public internet.
    { name = "LLM_PROVIDER", value = "bedrock" },
    { name = "BEDROCK_MODEL_ID", value = var.bedrock_model_id },
    { name = "BEDROCK_EMBEDDING_MODEL_ID", value = var.bedrock_embedding_model_id },

    # Identity: the client pool the API verifies tokens against. The issuer is
    # derived from region + pool id by the verifier, so it is not injected.
    { name = "COGNITO_REGION", value = var.aws_region },
    { name = "COGNITO_USER_POOL_ID", value = aws_cognito_user_pool.clients.id },
    { name = "COGNITO_CLIENT_ID", value = aws_cognito_user_pool_client.mobile.id },
  ]
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.name_prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.api_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.main["api"].repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = var.api_container_port
          hostPort      = var.api_container_port
          protocol      = "tcp"
          appProtocol   = "http"
        },
      ]

      environment = concat(local.shared_environment, [
        { name = "PORT", value = tostring(var.api_container_port) },
      ])
      secrets = local.api_secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "api"
        }
      }
    },
  ])

  tags = merge(local.common_tags, {
    Name     = "${var.name_prefix}-api-task"
    Workload = "api"
  })
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.name_prefix}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.worker_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "worker"
      image     = "${aws_ecr_repository.main["worker"].repository_url}:${var.image_tag}"
      essential = true

      environment = local.shared_environment
      secrets     = local.api_secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.worker.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "worker"
        }
      }
    },
  ])

  tags = merge(local.common_tags, {
    Name     = "${var.name_prefix}-worker-task"
    Workload = "worker"
  })
}

resource "aws_ecs_service" "api" {
  name            = "${var.name_prefix}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  platform_version = "LATEST"

  health_check_grace_period_seconds  = 30
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  enable_execute_command             = false

  network_configuration {
    subnets          = local.private_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = var.api_container_port
  }

  tags = merge(local.common_tags, {
    Name     = "${var.name_prefix}-api-service"
    Workload = "api"
  })

  depends_on = [
    aws_lb_listener.http,
    aws_iam_role_policy.api_task,
    aws_iam_role_policy.ecs_execution,
  ]
}

resource "aws_ecs_service" "worker" {
  name            = "${var.name_prefix}-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_desired_count
  launch_type     = "FARGATE"

  platform_version = "LATEST"

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
  enable_execute_command             = false

  network_configuration {
    subnets          = local.private_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  tags = merge(local.common_tags, {
    Name     = "${var.name_prefix}-worker-service"
    Workload = "worker"
  })

  depends_on = [
    aws_iam_role_policy.worker_task,
    aws_iam_role_policy.ecs_execution,
  ]
}
