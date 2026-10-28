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
#
# Facts learned wiring the connection (2026-10-28):
#   - The live connection is "Okuvu" in ap-south-1, the stack's own region. An
#     earlier eu-north-1 connection also worked (CodeBuild accepts a cross-region
#     connection ARN), but in-region removes a variable.
#   - source.location for a CODECONNECTIONS source must be a clone URL
#     ("https://github.com/<org>/<repo>.git"), not "org/repo" — the API rejects
#     the short form with "source location must be a valid GitHub repository URL".
#   - The service role needs codeconnections:GetConnectionToken (undocumented
#     but required) and the List* actions on "*" (they refuse ARN scoping).
#     Without them CreateProject/UpdateProject fails with the misleading
#     "OAuthProviderException: User is not authorized to access connection".
#     That error also persists ~30s after the policy is written: IAM eventual
#     consistency, not a wrong policy — retry before debugging it.
#   - CodeBuild VPC provisioning needs more EC2 than the documented set:
#     ec2:DescribeDhcpOptions ("error while getting DHCP options for VPC") and
#     ec2:CreateNetworkInterfacePermission ("UnauthorizedOperation"), both of
#     which fail before the build container ever starts.
#   - The project was first created outside Terraform with an S3 source (a zipped
#     upload). It is imported now, so switching to GITHUB is an in-place update.
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

  # List* on CodeConnections refuses ARN scoping: scoping it to the connection
  # silently denies the action and CreateProject reports it as "User is not
  # authorized to access connection".
  statement {
    sid    = "CodeConnectionsListLevel"
    effect = "Allow"

    actions = [
      "codeconnections:ListConnections",
      "codeconnections:ListInstallationTargets",
      "codeconnections:ListTagsForResource",
      "codestar-connections:ListConnections",
      "codestar-connections:ListInstallationTargets",
      "codestar-connections:ListTagsForResource",
    ]

    resources = ["*"]
  }

  # GetConnectionToken is required by CreateProject/UpdateProject validation but
  # is absent from the AWS IAM examples.
  statement {
    sid    = "CodeConnectionsUse"
    effect = "Allow"

    actions = [
      "codeconnections:GetConnection",
      "codeconnections:GetConnectionToken",
      "codeconnections:PassConnection",
      "codeconnections:UseConnection",
      "codestar-connections:GetConnection",
      "codestar-connections:GetConnectionToken",
      "codestar-connections:PassConnection",
      "codestar-connections:UseConnection",
    ]

    resources = [var.codestar_connection_arn]
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

  # The ECR scan gate in buildspec.yml reads scan findings before post_build
  # rolls images out. Without these the gate could not see any scan state and
  # failed the build after its timeout — the gate was blind, not the scans slow.
  statement {
    sid    = "EcrScanRead"
    effect = "Allow"

    actions = [
      "ecr:DescribeImageScanFindings",
      "ecr:DescribeImages",
      "ecr:BatchGetRepositoryScanningConfiguration",
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
      "ec2:CreateNetworkInterfacePermission",
      "ec2:DescribeNetworkInterfacePermissions",
      "ec2:ModifyNetworkInterfaceAttribute",
      "ec2:CreateTags",
      "ec2:DeleteTags",
      "ec2:DescribeNetworkInterfaces",
      "ec2:DeleteNetworkInterface",
      "ec2:DescribeSubnets",
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeVpcs",
      # CodeBuild resolves the VPC's DHCP option set while provisioning the
      # build environment; without this the build fails in PROVISIONING with
      # "VPC_CLIENT_ERROR Unexpected EC2 error: error while getting DHCP
      # options for VPC".
      "ec2:DescribeDhcpOptions",
      "ec2:DescribeRouteTables",
      "ec2:DescribeInternetGateways",
      "ec2:DescribeVpcEndpoints",
      "ec2:DescribeAvailabilityZones",
    ]

    resources = ["*"]
  }

  # S3 source fallback. CodeBuild can start a build with
  # `--source-type-override S3 --source-location-override <bucket>/<key>`, which
  # is how a build runs when the CodeConnections app has not been granted access
  # to the repository ("repository not found for primary source"). The role only
  # needs read on the build prefix of the uploads bucket.
  statement {
    sid    = "S3SourceFallback"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]

    resources = [
      aws_s3_bucket.uploads.arn,
      "${aws_s3_bucket.uploads.arn}/builds/*",
    ]
  }

  # buildspec.yml declares a `reports:` block (api-tests, JUnit XML). Uploading
  # it is its own permission set; without these the build passes every phase and
  # then fails in UPLOAD_ARTIFACTS with codebuild:CreateReportGroup AccessDenied.
  statement {
    sid    = "BuildReports"
    effect = "Allow"

    actions = [
      "codebuild:CreateReportGroup",
      "codebuild:CreateReport",
      "codebuild:UpdateReport",
      "codebuild:BatchPutTestCases",
      "codebuild:BatchPutCodeCoverages",
    ]

    resources = ["arn:aws:codebuild:${var.aws_region}:${data.aws_caller_identity.current.account_id}:report-group/${var.name_prefix}-build-*"]
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
    location        = "https://github.com/${var.github_repository}.git"
    buildspec       = "buildspec.yml"
    git_clone_depth = 1

    report_build_status = true

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

# Push-to-develop trigger.
#
# Before this resource the project had no webhook at all (`webhook: null`), so a
# push to develop started nothing: the only way to run a build was
# `aws codebuild start-build` by hand, which is the manual step this story
# removes. The filter group is deliberately narrow — EVENT PUSH on
# `^refs/heads/develop$` — so feature branches, tags and pull-request refs do
# not start deployments.
#
# The commit status on the GitHub commit is not set by this resource: it comes
# from `report_build_status = true` on the project source above, which CodeBuild
# uses to write STARTED/SUCCEEDED/FAILED back through the same CodeConnections
# connection.
#
# Pausing it: `aws codebuild delete-webhook --project-name evia-beta-build`
# stops all automatic builds without touching the project (the GitHub side is
# removed by the same call); set `enable_webhook = false` and apply to do it
# from code, which also keeps the state honest.
resource "aws_codebuild_webhook" "main" {
  count = var.codestar_connection_arn == "" || !var.enable_webhook ? 0 : 1

  project_name = aws_codebuild_project.main[0].name
  build_type   = "BUILD"

  filter_group {
    filter {
      type    = "EVENT"
      pattern = "PUSH"
    }

    filter {
      type    = "HEAD_REF"
      pattern = "^refs/heads/develop$"
    }
  }
}

resource "aws_cloudwatch_log_group" "codebuild" {
  count = var.codestar_connection_arn == "" ? 0 : 1

  name              = "/aws/codebuild/${var.name_prefix}-build"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-codebuild-logs"
  })
}
