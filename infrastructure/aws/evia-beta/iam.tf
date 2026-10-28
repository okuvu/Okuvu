data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    sid     = "EcsTasksAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

# ---------------------------------------------------------------------------
# Execution role: pulls the image, writes logs, reads the DB secret.
# Separate from the task roles below so the running app never holds ECR or
# secret-read rights of its own.
# ---------------------------------------------------------------------------
resource "aws_iam_role" "ecs_execution" {
  name               = "${var.name_prefix}-ecs-execution"
  description        = "ECS agent role: ECR pull, CloudWatch Logs, Secrets Manager read"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-ecs-execution"
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "ecs_execution" {
  statement {
    sid    = "ReadDatabaseSecret"
    effect = "Allow"

    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]

    # Every secret any container injects must be listed here: the worker fails
    # to start with AccessDenied on worker-internal-auth otherwise.
    resources = [
      aws_secretsmanager_secret.database.arn,
      aws_secretsmanager_secret.worker_internal_auth.arn,
      aws_secretsmanager_secret.nextauth_secret.arn,
      aws_secretsmanager_secret.portal_cognito_client.arn,
      aws_secretsmanager_secret.brevo.arn,
    ]
  }

  statement {
    sid    = "DecryptDatabaseSecret"
    effect = "Allow"

    actions = [
      "kms:Decrypt",
      "kms:DescribeKey",
    ]

    resources = [aws_kms_key.secrets.arn]
  }
}

resource "aws_iam_role_policy" "ecs_execution" {
  name   = "${var.name_prefix}-ecs-execution-extra"
  role   = aws_iam_role.ecs_execution.id
  policy = data.aws_iam_policy_document.ecs_execution.json
}

# ---------------------------------------------------------------------------
# api task role: uploads objects, enqueues summary jobs, uses the contacts key.
# ---------------------------------------------------------------------------
resource "aws_iam_role" "api_task" {
  name               = "${var.name_prefix}-api-task"
  description        = "Runtime role for the evia api container"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json

  tags = merge(local.common_tags, {
    Name     = "${var.name_prefix}-api-task"
    Workload = "api"
  })
}

data "aws_iam_policy_document" "api_task" {
  statement {
    sid    = "ListUploadsBucket"
    effect = "Allow"

    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.uploads.arn]
  }

  statement {
    sid    = "ReadWriteUploads"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:GetObjectVersion",
    ]

    resources = ["${aws_s3_bucket.uploads.arn}/*"]
  }

  statement {
    sid    = "UseUploadsKey"
    effect = "Allow"

    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]

    resources = [aws_kms_key.data.arn]
  }

  statement {
    sid       = "EnqueueSummaryJobs"
    effect    = "Allow"
    actions   = ["sqs:SendMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.summary.arn]
  }

  statement {
    sid    = "InvokeBedrockModels"
    effect = "Allow"

    # Required by OKUVU_LLM_PROVIDER=bedrock. Converse and ConverseStream are
    # data-plane calls authorised by the InvokeModel* actions, not separate ones.
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]

    resources = [
      "arn:aws:bedrock:${var.aws_region}::foundation-model/*",
      "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:inference-profile/*",
    ]
  }

  statement {
    sid    = "EncryptEmergencyContacts"
    effect = "Allow"

    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:GenerateDataKey",
      "kms:DescribeKey",
    ]

    resources = [aws_kms_key.contacts.arn]
  }
}

resource "aws_iam_role_policy" "api_task" {
  name   = "${var.name_prefix}-api-task-policy"
  role   = aws_iam_role.api_task.id
  policy = data.aws_iam_policy_document.api_task.json
}

# ---------------------------------------------------------------------------
# worker task role: consumes summary jobs, writes artefacts, same contacts key.
# No SQS send rights and no ALB, so it cannot re-enqueue its own work.
# ---------------------------------------------------------------------------
resource "aws_iam_role" "worker_task" {
  name               = "${var.name_prefix}-worker-task"
  description        = "Runtime role for the evia worker container"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json

  tags = merge(local.common_tags, {
    Name     = "${var.name_prefix}-worker-task"
    Workload = "worker"
  })
}

data "aws_iam_policy_document" "worker_task" {
  statement {
    sid    = "ListUploadsBucket"
    effect = "Allow"

    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.uploads.arn]
  }

  statement {
    sid    = "ReadWriteUploads"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:GetObjectVersion",
    ]

    resources = ["${aws_s3_bucket.uploads.arn}/*"]
  }

  statement {
    sid    = "UseUploadsKey"
    effect = "Allow"

    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]

    resources = [aws_kms_key.data.arn]
  }

  statement {
    sid    = "ConsumeSummaryJobs"
    effect = "Allow"

    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:ChangeMessageVisibility",
      "sqs:GetQueueAttributes",
    ]

    resources = [
      aws_sqs_queue.summary.arn,
      aws_sqs_queue.summary_dlq.arn,
    ]
  }

  statement {
    sid    = "InvokeBedrockModels"
    effect = "Allow"

    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]

    resources = [
      "arn:aws:bedrock:${var.aws_region}::foundation-model/*",
      "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:inference-profile/*",
    ]
  }

  statement {
    sid    = "DecryptEmergencyContacts"
    effect = "Allow"

    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:GenerateDataKey",
      "kms:DescribeKey",
    ]

    resources = [aws_kms_key.contacts.arn]
  }
}

resource "aws_iam_role_policy" "worker_task" {
  name   = "${var.name_prefix}-worker-task-policy"
  role   = aws_iam_role.worker_task.id
  policy = data.aws_iam_policy_document.worker_task.json
}
