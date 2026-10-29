# ---------------------------------------------------------------------------
# Task-stop alerting — EventBridge task state change -> ops SNS topic.
#
# Why this exists: the three `*-running-tasks-low` alarms (retired in
# observability.tf with this change) read ECS/ContainerInsights/RunningTaskCount,
# which is a paid custom metric namespace. This rule replaces them on the free
# EventBridge event stream: an ECS task that stops unexpectedly publishes one
# event, the rule matches it, and the ops topic receives the whole event body —
# task ARN, stoppedReason, stopCode and the container exit codes included.
#
# The match is deliberately NOT "lastStatus STOPPED" alone, because every
# rolling deployment and every scale-in produces a STOPPED event too, and the
# worker deploys at minimumHealthyPercent = 0 (it legitimately dips to zero
# tasks). Measured on this cluster on 2026-10-29 (evidence/E15-S8.md §2):
#
#   standalone run-task, container exits 3
#       lastStatus STOPPED  desiredStatus STOPPED  stopCode EssentialContainerExited
#   same task killed with stop-task
#       lastStatus STOPPED  desiredStatus STOPPED  stopCode UserInitiated  exitCode 137
#
# So `desiredStatus = RUNNING` is the right test for a *service* task that died
# mid-run, but it is absent from a standalone/batch task that failed — those
# report desiredStatus STOPPED with no service wanting them. The $or below
# covers both without matching either kind of intentional stop:
#
#   1. desiredStatus RUNNING
#        the service still wanted this task running when it went away: crash,
#        spot reclaim, task definition deleted mid-flight.
#   2. stopCode EssentialContainerExited AND a container exit code that is not 0
#        a one-off task whose own container failed. Excluded by the stopCode
#        term: UserInitiated (stop-task), ServiceSchedulerInitiated (deploy,
#        scale-in). Measured: an intentional stop-task exits 137, so a bare
#        "exitCode != 0" test would page on every deployment.
#
# Both branches were exercised live against this cluster before being written
# here; the exact outputs are in evidence/E15-S8.md §2.3.
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_event_rule" "task_stopped" {
  name        = "${var.name_prefix}-task-stopped"
  description = "ECS task stopped while it was supposed to be running (replaces the Container Insights running-count alarms)"

  event_pattern = jsonencode({
    source      = ["aws.ecs"]
    detail-type = ["ECS Task State Change"]
    detail = {
      clusterArn = [aws_ecs_cluster.main.arn]
      lastStatus = ["STOPPED"]
      "$or" = [
        { desiredStatus = ["RUNNING"] },
        {
          stopCode   = ["EssentialContainerExited"]
          containers = { exitCode = [{ "anything-but" = [0] }] }
        },
      ]
    }
  })

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-task-stopped"
  })
}

resource "aws_cloudwatch_event_target" "task_stopped_ops_sns" {
  rule      = aws_cloudwatch_event_rule.task_stopped.name
  target_id = "ops-alerts-sns"
  arn       = aws_sns_topic.ops_alerts.arn

  # The full event is delivered as the SNS message body: it already carries
  # taskArn, stopCode, stoppedReason and containers[].exitCode, so an input
  # transformer would only remove fields the on-call reader needs.
  depends_on = [aws_sns_topic_policy.ops_alerts]
}

# ---------------------------------------------------------------------------
# Topic policy for the ops topic.
#
# aws_sns_topic.ops_alerts (observability.tf) is created by terraform without a
# policy resource, so it carries the AWS default policy: account-owner access
# only, via the AWS:SourceOwner condition below. That default is what lets
# CloudWatch alarms publish today, so it is reproduced verbatim as statement 1
# — this resource replaces the whole document, and dropping it would silently
# break every existing alarm.
#
# Statement 2 is the grant EventBridge needs: events.amazonaws.com may publish,
# but only for this one rule in this account. Without it the rule's target fails
# with "Not authorized to perform SNS:Publish" and the alert is lost while the
# rule still looks healthy (FailedInvocations is the only trace).
#
# No execution role is required for an SNS target in the same account — the
# resource policy is the whole authorisation.
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "ops_alerts_topic" {
  statement {
    sid    = "__default_statement_ID"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions = [
      "SNS:GetTopicAttributes",
      "SNS:SetTopicAttributes",
      "SNS:AddPermission",
      "SNS:RemovePermission",
      "SNS:DeleteTopic",
      "SNS:Subscribe",
      "SNS:ListSubscriptionsByTopic",
      "SNS:Publish",
    ]

    resources = [aws_sns_topic.ops_alerts.arn]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceOwner"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid    = "AllowEventBridgeTaskStoppedPublish"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.ops_alerts.arn]

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.task_stopped.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "ops_alerts" {
  arn    = aws_sns_topic.ops_alerts.arn
  policy = data.aws_iam_policy_document.ops_alerts_topic.json
}
