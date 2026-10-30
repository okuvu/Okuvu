resource "aws_s3_bucket" "uploads" {
  bucket = "${var.name_prefix}-uploads-${data.aws_caller_identity.current.account_id}"

  tags = merge(local.common_tags, {
    Name               = "${var.name_prefix}-uploads"
    DataClassification = "sensitive"
    Purpose            = "user-uploads"
  })
}

resource "aws_s3_bucket_ownership_controls" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.data.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# ---------------------------------------------------------------------------
# ALB access logs.
#
# Without these there is no record of who hit which route, from which address,
# with which status and how many bytes — the ALB keeps only aggregate metrics.
# For a health product under DPDP that is an audit-trail hole: an access request
# or a breach investigation has nothing to reconstruct from. Access logs are the
# cheapest evidence that survives an incident (no agent, written by the LB).
#
# Same-region requirement: ALB access logging only accepts a bucket in the load
# balancer's own region, so this has to live in ap-south-1 with the stack.
# SSE-S3 rather than the customer-managed data key: ELB cannot be granted
# kms:GenerateDataKey through this bucket policy alone, and a KMS grant that
# silently fails is worse than AES-256 with S3-managed keys.
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "alb_logs" {
  bucket = "${var.name_prefix}-alb-logs-${data.aws_caller_identity.current.account_id}"

  tags = merge(local.common_tags, {
    Name               = "${var.name_prefix}-alb-logs"
    DataClassification = "sensitive"
    Purpose            = "alb-access-logs"
  })
}

resource "aws_s3_bucket_ownership_controls" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Retention is a DPDP decision as much as a cost one: 90 days is long enough to
# answer "what happened around this date" and short enough that the bucket never
# becomes an unmanaged archive of client IPs.
resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    id     = "expire-access-logs"
    status = "Enabled"

    filter {}

    expiration {
      days = var.alb_access_log_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# The documented policy shape for ALB access logs: the log-delivery service
# principal may PutObject only under this account's own prefix path, which is
# where ELB writes (bucket/prefix/AWSLogs/<account>/<region>/...). No
# aws:SourceAccount condition — the logdelivery principal does not reliably
# carry it, and a condition that never matches fails closed (logs just stop
# appearing), which is the one outcome this bucket exists to prevent.
data "aws_iam_policy_document" "alb_logs" {
  statement {
    sid    = "AllowELBLogDelivery"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["logdelivery.elasticloadbalancing.amazonaws.com"]
    }

    actions = ["s3:PutObject"]

    resources = [
      "${aws_s3_bucket.alb_logs.arn}/${local.alb_access_log_prefix}/AWSLogs/${data.aws_caller_identity.current.account_id}/*",
    ]
  }

  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.alb_logs.arn,
      "${aws_s3_bucket.alb_logs.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  policy = data.aws_iam_policy_document.alb_logs.json

  depends_on = [aws_s3_bucket_public_access_block.alb_logs]
}

data "aws_iam_policy_document" "uploads" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.uploads.arn,
      "${aws_s3_bucket.uploads.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid    = "DenyUnencryptedUploads"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.uploads.arn}/*"]

    # Presigned PUTs must be generated with ServerSideEncryption=aws:kms;
    # without the header the request is denied even though the bucket has
    # default SSE-KMS. Kept strict so a client cannot downgrade to AES256.
    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption"
      values   = ["aws:kms"]
    }
  }
}

resource "aws_s3_bucket_policy" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  policy = data.aws_iam_policy_document.uploads.json

  depends_on = [aws_s3_bucket_public_access_block.uploads]
}
