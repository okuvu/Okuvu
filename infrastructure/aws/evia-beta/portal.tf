# =============================================================================
# Therapist portal — ECS Fargate service behind the shared ALB.
#
# The portal was the one workload with no AWS home: it had no Dockerfile and no
# Terraform, so "therapist portal on AWS" meant Vercel or nothing. It is a
# Next.js app whose tRPC routers talk to Postgres server-side, so it needs a
# long-running Node process — Fargate beside api/worker, not S3/CloudFront.
#
# Routing is host-based, not path-based: the portal owns portal.<domain> and the
# api keeps the listener default. Path-based rules would collide, because the
# portal serves its own /api/trpc and /api/auth.
# =============================================================================

resource "aws_cloudwatch_log_group" "portal" {
  name              = "/ecs/${var.name_prefix}/portal"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name     = "${var.name_prefix}-portal-logs"
    Workload = "portal"
  })
}

resource "aws_lb_target_group" "portal" {
  name        = "${var.name_prefix}-portal-tg"
  port        = var.portal_container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  deregistration_delay = 30

  health_check {
    enabled = true
    # Unauthenticated route handler (src/app/api/health/route.ts), exempted in
    # proxy.ts. Polling / would return 307 to /auth and never go healthy.
    path                = "/api/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = merge(local.common_tags, {
    Name     = "${var.name_prefix}-portal-tg"
    Workload = "portal"
  })
}

locals {
  portal_url = "https://${var.portal_hostname}"

  # NextAuth takes its origin from NEXTAUTH_URL when that is set, and otherwise
  # from the request's Host header (next-auth v4 only trusts that header when
  # AUTH_TRUST_HOST is set). Deriving the origin is what lets one deployment
  # complete the OAuth round-trip on okuvu.in, www.okuvu.in and
  # portal.okuvu.in alike; pin var.portal_nextauth_url to force a single
  # canonical origin instead. Either way the origin must be a hostname
  # registered on the app client, so a forged Host header cannot be used to
  # build a redirect_uri Cognito would accept.
  portal_auth_environment = (
    var.portal_nextauth_url == ""
    ? [{ name = "AUTH_TRUST_HOST", value = "true" }]
    : [{ name = "NEXTAUTH_URL", value = var.portal_nextauth_url }]
  )

  portal_environment = concat([
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = tostring(var.portal_container_port) },
    { name = "HOSTNAME", value = "0.0.0.0" },
    { name = "NEXT_TELEMETRY_DISABLED", value = "1" },
    { name = "AWS_REGION", value = var.aws_region },
    { name = "COGNITO_REGION", value = var.aws_region },

    # Identity: the therapist pool, never the client pool. MFA is enforced by
    # the pool (see cognito.tf), not by the app.
    { name = "COGNITO_THERAPIST_POOL_ID", value = aws_cognito_user_pool.therapists.id },
    { name = "COGNITO_THERAPIST_CLIENT_ID", value = aws_cognito_user_pool_client.portal.id },
    { name = "COGNITO_ISSUER", value = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.therapists.id}" },

    # Admin allowlist gating /admin. Empty disables the admin console entirely
    # (audit F-07), which is the safe default for a stack nobody has populated.
    { name = "ADMIN_EMAILS", value = var.admin_emails },

    { name = "BREVO_FROM_EMAIL", value = var.brevo_from_email },
    { name = "BREVO_FROM_NAME", value = var.brevo_from_name },
  ], local.portal_auth_environment)

  portal_secrets = [
    {
      name      = "DATABASE_URL"
      valueFrom = "${aws_secretsmanager_secret.database.arn}:database_url::"
    },
    {
      name      = "NEXTAUTH_SECRET"
      valueFrom = "${aws_secretsmanager_secret.nextauth_secret.arn}:secret::"
    },
    {
      name      = "COGNITO_THERAPIST_CLIENT_SECRET"
      valueFrom = "${aws_secretsmanager_secret.portal_cognito_client.arn}:secret::"
    },
    {
      name      = "BREVO_API_KEY"
      valueFrom = "${aws_secretsmanager_secret.brevo.arn}:api_key::"
    },
  ]
}

resource "aws_ecs_task_definition" "portal" {
  family                   = "${var.name_prefix}-portal"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.portal_cpu
  memory                   = var.portal_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn

  # No task role: the portal holds no AWS credentials at run time. It reaches
  # Cognito over its public HTTPS endpoints and Postgres over the VPC, so a task
  # role would only widen blast radius.
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "portal"
      image     = "${aws_ecr_repository.main["portal"].repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = var.portal_container_port
          hostPort      = var.portal_container_port
          protocol      = "tcp"
          appProtocol   = "http"
        },
      ]

      environment = local.portal_environment
      secrets     = local.portal_secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.portal.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "portal"
        }
      }
    },
  ])

  # The build pipeline owns image revisions (scripts/ecs-image-pin.py). Terraform
  # manages the shape of the task definition, not which revision is deployed.
  lifecycle {
    ignore_changes = [container_definitions]
  }

  tags = merge(local.common_tags, {
    Name     = "${var.name_prefix}-portal-task"
    Workload = "portal"
  })
}

resource "aws_ecs_service" "portal" {
  name            = "${var.name_prefix}-portal"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.portal.arn
  desired_count   = var.portal_desired_count
  launch_type     = "FARGATE"

  platform_version = "LATEST"

  health_check_grace_period_seconds  = 60
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  enable_execute_command             = false

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.private_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.portal.arn
    container_name   = "portal"
    container_port   = var.portal_container_port
  }

  # The pipeline updates this to the revision it registered; terraform must not
  # drag the service back to an older revision on an unrelated apply.
  lifecycle {
    ignore_changes = [task_definition]
  }

  tags = merge(local.common_tags, {
    Name     = "${var.name_prefix}-portal-service"
    Workload = "portal"
  })

  depends_on = [
    aws_lb_listener.http,
    aws_iam_role_policy.ecs_execution,
  ]
}

# -----------------------------------------------------------------------------
# Listener rules. One per listener that actually exists: the HTTP listener is a
# redirect when TLS is configured, so portal traffic arrives on :443 only.
# -----------------------------------------------------------------------------

resource "aws_lb_listener_rule" "portal_https" {
  count = local.https_enabled ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.portal.arn
  }

  condition {
    host_header {
      values = local.portal_public_hostnames
    }
  }

  tags = merge(local.common_tags, {
    Name     = "${var.name_prefix}-portal-https-rule"
    Workload = "portal"
  })
}

resource "aws_lb_listener_rule" "portal_http" {
  count = local.https_enabled ? 0 : 1

  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.portal.arn
  }

  condition {
    host_header {
      values = local.portal_public_hostnames
    }
  }

  tags = merge(local.common_tags, {
    Name     = "${var.name_prefix}-portal-http-rule"
    Workload = "portal"
  })
}
