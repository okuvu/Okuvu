locals {
  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Stack       = "evia-beta"
  }

  # { "ap-south-1a" = 0, "ap-south-1b" = 1 } — drives the subnet for_each loops
  # and indexes into the public/private CIDR lists.
  subnet_azs = { for index, az in var.availability_zones : az => index }

  public_subnet_ids  = [for subnet in aws_subnet.public : subnet.id]
  private_subnet_ids = [for subnet in aws_subnet.private : subnet.id]

  # Key prefix inside the ALB access-log bucket. ELB appends
  # /AWSLogs/<account>/<region>/... under it, and the bucket policy is scoped to
  # exactly that path. Changing it here changes both, so they cannot drift.
  alb_access_log_prefix = "alb"
}
