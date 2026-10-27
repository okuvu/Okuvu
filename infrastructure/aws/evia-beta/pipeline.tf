# =============================================================================
# CodeBuild project that runs buildspec.yml.
#
# buildspec.yml existed but had no runner: the pipeline was documented as a
# manual console setup ("set these in Terraform/console, not here"). This makes
# the runner part of the stack, so the deploy path is code rather than a
# checklist entry.
#
# The GitHub side cannot be created by Terraform: a CodeStar connection needs an
# interactive OAuth handshake by the repository owner. Create it once in the
# console (Developer Tools → Connections → GitHub), then pass its ARN as
# codestar_connection_arn. Until that variable is set this resource is not
# created and nothing else changes.
# =============================================================================

resource "aws_iam_role" "codebuild" {
  count = var.codestar_connection_arn == "" ? 0 : 1

  name               = "${var.name_prefix}-codebuild"
  description        = "CodeBuild role: ECR push, ECS rollout, migrations, logs"
  assume_role_policy = data.aws_iam_policy_document.codebuild_assume[0].json

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-codebuild"
  })
}

data "aws_iam_policy_document" "codebuild_assume" {
  count = var.codestar_connection_arn == "" ? 0 : 1

  statement {
    sid     = "CodeBuildAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["codebuild.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

data "aws_iam_policy_document" "codebuild" {
  count = var.codestar_connection_arn == "" ? 0 : 1

  statement {
    sid    = "Logs"
    effect = "Allow"

    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/codebuild/*"]
  }

  statement {
    sid    = "EcrAuth"
    effect = "Allow"

    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "EcrPushPull"
    effect = "Allow"

    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]

    resources = [for repo in aws_ecr_repository.main : repo.arn]
  }

  statement {
    sid    = "EcsRollout"
    effect = "Allow"

    actions = [
      "ecs:DescribeServices",
      "ecs:DescribeTaskDefinition",
      "ecs:RegisterTaskDefinition",
      "ecs:UpdateService",
    ]

    resources = ["*"]
  }

  statement {
    sid       = "PassTaskRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.ecs_execution.arn, aws_iam_role.api_task.arn, aws_iam_role.worker_task.arn]
  }

  statement {
    sid    = "MigrationSecret"
    effect = "Allow"

    actions = [
      "secretsmanager:GetSecretValue",
      "kms:Decrypt",
    ]

    resources = [aws_secretsmanager_secret.database.arn, aws_kms_key.secrets.arn]
  }

  statement {
    sid    = "VpcNetworking"
    effect = "Allow"

    actions = [
      "ec2:CreateNetworkInterface",
      "ec2:DescribeNetworkInterfaces",
      "ec2:DeleteNetworkInterface",
      "ec2:DescribeSubnets",
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeVpcs",
    ]

    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "codebuild" {
  count = var.codestar_connection_arn == "" ? 0 : 1

  name   = "${var.name_prefix}-codebuild"
  role   = aws_iam_role.codebuild[0].id
  policy = data.aws_iam_policy_document.codebuild[0].json
}

resource "aws_codebuild_project" "main" {
  count = var.codestar_connection_arn == "" ? 0 : 1

  name          = "${var.name_prefix}-build"
  description   = "Build, test, migrate and roll the Okuvu api, worker and portal onto ECS"
  service_role  = aws_iam_role.codebuild[0].arn
  build_timeout = 60

  artifacts {
    # Images go to ECR and the rollout happens in post_build, so there is no
    # build artefact to keep.
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type    = var.codebuild_compute_type
    image           = "aws/codebuild/standard:8.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = true # docker build

    image_pull_credentials_type = "CODEBUILD"
  }

  # private subnets + the ECS security group: the migrate phase has to reach
  # RDS:5432, and the build has to reach ECR and Secrets Manager.
  vpc_config {
    vpc_id             = aws_vpc.main.id
    subnets            = local.private_subnet_ids
    security_group_ids = [aws_security_group.ecs.id]
  }

  source {
    type            = "GITHUB"
    location        = var.github_repository
    buildspec       = "buildspec.yml"
    git_clone_depth = 1

    auth {
      type     = "CODECONNECTIONS"
      resource = var.codestar_connection_arn
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name  = "/aws/codebuild/${var.name_prefix}-build"
      stream_name = "build"
    }
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-build"
  })

  depends_on = [aws_iam_role_policy.codebuild]
}

resource "aws_cloudwatch_log_group" "codebuild" {
  count = var.codestar_connection_arn == "" ? 0 : 1

  name              = "/aws/codebuild/${var.name_prefix}-build"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-codebuild-logs"
  })
}
