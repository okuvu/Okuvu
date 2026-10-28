# =============================================================================
# DNS, TLS and the public hostnames the mobile app and portal are configured
# with. This replaced nothing on GCP — Cloud Run handed out
# *.a.run.app hostnames and Google-managed certs for free, so the equivalent
# AWS resources simply did not exist before the cutover.
#
# The zone is created here and delegated at the registrar by hand: okuvu.in is
# registered at Spaceship, so pasting the zone's NS records into Spaceship is
# the one step Terraform cannot do. Until that happens nothing resolves.
# =============================================================================

locals {
  # Hostnames the app and portal build against, all alias records to the ALB.
  alb_hostnames = [
    "api.${var.dns_zone_name}",      # mobile prod  (apps/mobile/lib/src/config/environment.dart)
    "beta.api.${var.dns_zone_name}", # mobile beta
    "portal.${var.dns_zone_name}",   # therapist portal
  ]

  # Plan-time boolean: counts and for_each cannot depend on the certificate ARN
  # itself (it is only known after the ACM validation resource applies), so they
  # key off this instead.
  https_enabled = var.alb_certificate_arn != "" || var.manage_dns

  # Prefer an explicitly supplied certificate; otherwise use the one issued here.
  alb_certificate_arn = (
    var.alb_certificate_arn != ""
    ? var.alb_certificate_arn
    : (var.manage_dns ? aws_acm_certificate_validation.main[0].certificate_arn : "")
  )
}

resource "aws_route53_zone" "main" {
  count = var.manage_dns ? 1 : 0

  name = var.dns_zone_name

  tags = merge(local.common_tags, {
    Name = "${var.dns_zone_name}-zone"
  })
}

resource "aws_acm_certificate" "main" {
  count = var.manage_dns ? 1 : 0

  domain_name = var.dns_zone_name

  # Every name the clients use. Wildcards only cover one label, so
  # beta.api.<domain> has to be listed separately.
  subject_alternative_names = concat(
    ["www.${var.dns_zone_name}"],
    local.alb_hostnames,
  )

  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, {
    Name = "${var.dns_zone_name}-cert"
  })
}

resource "aws_route53_record" "cert_validation" {
  for_each = var.manage_dns ? {
    for dvo in aws_acm_certificate.main[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id = aws_route53_zone.main[0].zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60

  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "main" {
  count = var.manage_dns ? 1 : 0

  certificate_arn         = aws_acm_certificate.main[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]

  timeouts {
    create = "30m"
  }
}

# Alias records (not CNAMEs): free to resolve, and they survive the ALB being
# replaced on a rebuild.
resource "aws_route53_record" "alb" {
  for_each = var.manage_dns ? toset(local.alb_hostnames) : toset([])

  zone_id = aws_route53_zone.main[0].zone_id
  name    = each.value
  type    = "A"

  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "alb_ipv6" {
  for_each = var.manage_dns ? toset(local.alb_hostnames) : toset([])

  zone_id = aws_route53_zone.main[0].zone_id
  name    = each.value
  type    = "AAAA"

  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}
