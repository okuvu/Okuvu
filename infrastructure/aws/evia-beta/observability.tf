resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.name_prefix}/api"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name     = "${var.name_prefix}-api-logs"
    Workload = "api"
  })
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${var.name_prefix}/worker"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name     = "${var.name_prefix}-worker-logs"
    Workload = "worker"
  })
}

# ---------------------------------------------------------------------------
# VPC flow logs — network-level audit trail in its own log group.
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "flow" {
  name              = "/vpc/${var.name_prefix}/flow"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-vpc-flow-logs"
  })
}

data "aws_iam_policy_document" "flow_log_assume" {
  statement {
    sid     = "VpcFlowLogsAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "flow_log" {
  name               = "${var.name_prefix}-vpc-flow-logs"
  description        = "Allows VPC flow logs to write to CloudWatch Logs"
  assume_role_policy = data.aws_iam_policy_document.flow_log_assume.json

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-vpc-flow-logs"
  })
}

data "aws_iam_policy_document" "flow_log" {
  statement {
    sid    = "WriteFlowLogs"
    effect = "Allow"

    actions = [
      "logs:CreateLogStream",
      "logs:DescribeLogStreams",
      "logs:PutLogEvents",
    ]

    resources = [
      aws_cloudwatch_log_group.flow.arn,
      "${aws_cloudwatch_log_group.flow.arn}:*",
    ]
  }
}

resource "aws_iam_role_policy" "flow_log" {
  name   = "${var.name_prefix}-vpc-flow-logs"
  role   = aws_iam_role.flow_log.id
  policy = data.aws_iam_policy_document.flow_log.json
}

resource "aws_flow_log" "vpc" {
  vpc_id                   = aws_vpc.main.id
  traffic_type             = "ALL"
  log_destination_type     = "cloud-watch-logs"
  log_destination          = aws_cloudwatch_log_group.flow.arn
  iam_role_arn             = aws_iam_role.flow_log.arn
  max_aggregation_interval = 600

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-vpc-flow-log"
  })
}

# ---------------------------------------------------------------------------
# Operational alarms
# ---------------------------------------------------------------------------
resource "aws_sns_topic" "ops_alerts" {
  name = "${var.name_prefix}-ops-alerts"

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-ops-alerts"
  })
}

resource "aws_sns_topic_subscription" "ops_email" {
  count = var.alarm_notification_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.ops_alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_notification_email
}

# Durable sink for every alarm notification.
#
# Email subscriptions stay in PendingConfirmation until a human clicks the
# link, and SNS does not retry a confirmation email that a mail filter eats.
# A queue subscription is active the moment it is created, so no alarm is
# ever lost to an unconfirmed mailbox: the message is retained for four days
# and can be read with
#   aws sqs receive-message --queue-url <url>
resource "aws_sqs_queue" "ops_alerts_sink" {
  name                       = "${var.name_prefix}-ops-alerts-sink"
  message_retention_seconds  = 345600
  visibility_timeout_seconds = 30
  sqs_managed_sse_enabled    = true

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-ops-alerts-sink"
  })
}

data "aws_iam_policy_document" "ops_alerts_sink" {
  statement {
    sid       = "AllowOpsTopic"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.ops_alerts_sink.arn]

    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_sns_topic.ops_alerts.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "ops_alerts_sink" {
  queue_url = aws_sqs_queue.ops_alerts_sink.id
  policy    = data.aws_iam_policy_document.ops_alerts_sink.json
}

resource "aws_sns_topic_subscription" "ops_queue" {
  topic_arn = aws_sns_topic.ops_alerts.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.ops_alerts_sink.arn
}

resource "aws_cloudwatch_metric_alarm" "api_target_5xx" {
  alarm_name          = "${var.name_prefix}-api-target-5xx"
  alarm_description   = "api is returning 5XX responses to the ALB"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
  }

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-api-target-5xx"
  })
}

resource "aws_cloudwatch_metric_alarm" "api_unhealthy_hosts" {
  alarm_name          = "${var.name_prefix}-api-unhealthy-hosts"
  alarm_description   = "No healthy api task is registered with the target group"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-api-unhealthy-hosts"
  })
}

# Portal had no alarm at all: it could lose its only task and return 503 with
# nothing firing. Same ALB metrics as api, so this closes the gap for free.
resource "aws_cloudwatch_metric_alarm" "portal_unhealthy_hosts" {
  alarm_name          = "${var.name_prefix}-portal-unhealthy-hosts"
  alarm_description   = "No healthy portal task is registered with the target group"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
    TargetGroup  = aws_lb_target_group.portal.arn_suffix
  }

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-portal-unhealthy-hosts"
  })
}

# ---------------------------------------------------------------------------
# Running count vs desired count — RETIRED (E15-S8).
#
# These three alarms read ECS/ContainerInsights/RunningTaskCount, i.e. from a
# paid custom-metric namespace: 108 metric streams x $0.30 = $32.40/mo to answer
# one question ("is the task still there?"). They are replaced by
# aws_cloudwatch_event_rule.task_stopped in alerts.tf, which listens to the ECS
# task state change stream instead. That stream is free, real-time, and carries
# strictly more than the alarm had: stopCode, stoppedReason and the container
# exit codes.
#
# They MUST be removed in the same apply that sets containerInsights =
# "disabled" in ecs.tf. Left behind with the metric namespace off, there is no
# data to evaluate, and treat_missing_data = breaching turns that into a
# permanent ALARM state — three alarms paging forever about a metric that no
# longer exists.
#
# The ALB alarms above still cover api and portal behind the load balancer, and
# the RDS alarms below are unchanged; the worker only ever had this rule as its
# liveness signal, and now has the task-stop rule.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# RDS alarms. The database had none: it could fill its 20 GiB or run out of
# the 100 max_connections and the first signal would be api 5xx.
#
# FreeStorageSpace is in bytes and excludes the 100 GiB autoscaling headroom
# above it — a roomy-looking number that is still only 20 GiB of real disk, so
# 5 GiB is the last-resort threshold before "no space left on device". The alarm
# is Average < threshold over 10 min to ignore a vacuum or a large migration
# spiking write-ahead log volume for a few minutes.
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  alarm_name        = "${var.name_prefix}-rds-free-storage-low"
  alarm_description = "Postgres has under ${var.rds_free_storage_alarm_gb} GiB of free storage left and will reject writes"

  namespace   = "AWS/RDS"
  metric_name = "FreeStorageSpace"
  statistic   = "Average"

  period             = 300
  evaluation_periods = 2

  # GiB, converted to the bytes the metric is published in.
  threshold           = var.rds_free_storage_alarm_gb * 1073741824
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-rds-free-storage-low"
  })
}

# max_connections is pinned to 100 in aws_db_parameter_group.main (rds.tf), so
# 80 is the "connections are about to be refused" line, not an arbitrary 80%.
resource "aws_cloudwatch_metric_alarm" "rds_connections_high" {
  alarm_name        = "${var.name_prefix}-rds-connections-high"
  alarm_description = "Postgres is above ${var.rds_max_connections_alarm} of its 100 max_connections"

  namespace   = "AWS/RDS"
  metric_name = "DatabaseConnections"
  statistic   = "Average"

  period             = 300
  evaluation_periods = 2

  threshold           = var.rds_max_connections_alarm
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-rds-connections-high"
  })
}

# ---------------------------------------------------------------------------
# Budget alarm
# ---------------------------------------------------------------------------
resource "aws_sns_topic" "budget_alerts" {
  name = "${var.name_prefix}-budget-alerts"

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-budget-alerts"
  })
}

data "aws_iam_policy_document" "budget_topic" {
  statement {
    sid       = "AllowBudgetsPublish"
    effect    = "Allow"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.budget_alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "budget_alerts" {
  arn    = aws_sns_topic.budget_alerts.arn
  policy = data.aws_iam_policy_document.budget_topic.json
}

resource "aws_sns_topic_subscription" "budget_email" {
  count = var.budget_notification_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.budget_alerts.arn
  protocol  = "email"
  endpoint  = var.budget_notification_email
}

# Unfiltered on purpose: a Project=okuvu cost filter silently matches nothing
# until that tag is activated as a cost allocation tag in Billing.
resource "aws_budgets_budget" "monthly" {
  name         = "${var.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = "80"
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.budget_alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = "100"
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_sns_topic_arns = [aws_sns_topic.budget_alerts.arn]
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-monthly-budget"
  })
}
