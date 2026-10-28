locals {
  kms_root_principal = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"

  # Three separate customer-managed keys so that decrypt rights can be scoped
  # per purpose instead of handing every consumer one shared key.
  encryption_keys = {
    contacts = {
      alias       = "${var.name_prefix}-contacts"
      description = "Column-level encryption of emergency contact fields (application-side envelope encryption)"
    }
    data = {
      alias       = "${var.name_prefix}-data"
      description = "At-rest encryption for RDS, ElastiCache and the uploads bucket"
    }
    secrets = {
      alias       = "${var.name_prefix}-secrets"
      description = "Encryption for Secrets Manager secrets holding database credentials"
    }
  }
}

data "aws_iam_policy_document" "kms" {
  for_each = local.encryption_keys

  statement {
    sid       = "EnableAccountAdmin"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = [local.kms_root_principal]
    }
  }
}

resource "aws_kms_key" "contacts" {
  description             = local.encryption_keys["contacts"].description
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.kms["contacts"].json

  tags = merge(local.common_tags, {
    Name    = "${var.name_prefix}-contacts"
    Purpose = "column-encryption"
  })
}

resource "aws_kms_key" "data" {
  description             = local.encryption_keys["data"].description
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.kms["data"].json

  tags = merge(local.common_tags, {
    Name    = "${var.name_prefix}-data"
    Purpose = "at-rest-encryption"
  })
}

resource "aws_kms_key" "secrets" {
  description             = local.encryption_keys["secrets"].description
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.kms["secrets"].json

  tags = merge(local.common_tags, {
    Name    = "${var.name_prefix}-secrets"
    Purpose = "secrets-encryption"
  })
}

resource "aws_kms_alias" "contacts" {
  name          = "alias/${local.encryption_keys["contacts"].alias}"
  target_key_id = aws_kms_key.contacts.key_id
}

resource "aws_kms_alias" "data" {
  name          = "alias/${local.encryption_keys["data"].alias}"
  target_key_id = aws_kms_key.data.key_id
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${local.encryption_keys["secrets"].alias}"
  target_key_id = aws_kms_key.secrets.key_id
}
