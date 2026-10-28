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
