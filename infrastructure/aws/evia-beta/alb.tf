resource "aws_lb" "api" {
  name               = "${var.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = local.public_subnet_ids

  # Dualstack so the apex and www AAAA alias records actually answer. An
  # IPv4-only ALB makes Route53 return NODATA for AAAA aliases even though the
  # record exists. Requires the VPC /56 and per-subnet /64 in vpc.tf.
  ip_address_type = "dualstack"

  idle_timeout                     = 60
  enable_deletion_protection       = false
  enable_cross_zone_load_balancing = true
  drop_invalid_header_fields       = true

  # Audit trail: one line per request (client IP, route, status, bytes,
  # timings) into the dedicated bucket above. Without this the only record of
  # traffic is five-minute aggregate metrics.
  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = local.alb_access_log_prefix
    enabled = true
  }

  # ModifyLoadBalancerAttributes fails with "Access Denied for bucket" if the
  # bucket policy is not attached yet, and the bucket name alone does not imply
  # that dependency. Ordering is explicit so a first apply cannot fail here.
  depends_on = [aws_s3_bucket_policy.alb_logs]

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-alb"
  })
}

resource "aws_lb_target_group" "api" {
  name        = "${var.name_prefix}-api-tg"
  port        = var.api_container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  deregistration_delay = 30

  health_check {
    enabled             = true
    path                = var.health_check_path
    port                = "traffic-port"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-api-tg"
  })
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  # Plaintext is only the default target before a certificate exists. Once TLS
  # is configured (dns.tf issues the cert, or alb_certificate_arn is supplied)
  # :80 redirects, because the portal sets auth cookies and the mobile app sends
  # bearer tokens — neither may cross the wire unencrypted.
  dynamic "default_action" {
    for_each = [1]

    content {
      type             = local.https_enabled ? "redirect" : "forward"
      target_group_arn = local.https_enabled ? null : aws_lb_target_group.api.arn

      dynamic "redirect" {
        for_each = local.https_enabled ? [1] : []

        content {
          port        = "443"
          protocol    = "HTTPS"
          status_code = "HTTP_301"
        }
      }
    }
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-http-listener"
  })
}

# HTTPS is created once a certificate exists — either the ACM certificate issued
# in dns.tf, or one supplied through var.alb_certificate_arn.
resource "aws_lb_listener" "https" {
  count = local.https_enabled ? 1 : 0

  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = local.alb_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-https-listener"
  })
}
