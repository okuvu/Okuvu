resource "aws_sqs_queue" "summary_dlq" {
  name                       = "${var.name_prefix}-summary-jobs-dlq"
  message_retention_seconds  = 1209600
  sqs_managed_sse_enabled    = true
  visibility_timeout_seconds = 300

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-summary-jobs-dlq"
    Role = "dead-letter"
  })
}

# Summary generation jobs. The worker polls this queue; the api only enqueues.
resource "aws_sqs_queue" "summary" {
  name                       = "${var.name_prefix}-summary-jobs"
  visibility_timeout_seconds = 900
  message_retention_seconds  = 1209600
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.summary_dlq.arn
    maxReceiveCount     = 3
  })

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-summary-jobs"
    Role = "work-queue"
  })
}
