# =============================================================================
# Mail records in the okuvu.in zone.
#
# These four records (MX, SPF, DMARC, Google DKIM) were created by hand when
# the domain was pointed at Google Workspace. They are not server
# infrastructure, but they live in the zone Terraform created, so leaving
# them unmanaged means the beta account still holds hand-created Route 53
# state that `terraform state list` cannot explain.
#
# Values are byte-identical to the live records, including the two-chunk
# DKIM string: the provider strips exactly one outer quote pair on read and
# re-adds it on write, so the multi-chunk form has to be reproduced verbatim.
#
# allow_overwrite = false, matching the alb records: a collision must fail
# loudly rather than silently repoint mail.
#
# Import IDs are zone_id_name_type:
#   terraform import 'aws_route53_record.mail["okuvu.in-MX"]'                 Z04967962T87OWS0AZZBZ_okuvu.in_MX
#   terraform import 'aws_route53_record.mail["okuvu.in-TXT"]'                Z04967962T87OWS0AZZBZ_okuvu.in_TXT
#   terraform import 'aws_route53_record.mail["_dmarc.okuvu.in-TXT"]'         Z04967962T87OWS0AZZBZ__dmarc.okuvu.in_TXT
#   terraform import 'aws_route53_record.mail["google._domainkey.okuvu.in-TXT"]' Z04967962T87OWS0AZZBZ_google._domainkey.okuvu.in_TXT
# =============================================================================

locals {
  # Keyed name-type so the terraform address stays readable and stable.
  mail_records = {
    "okuvu.in-MX" = {
      name    = "okuvu.in"
      type    = "MX"
      ttl     = 1800
      records = ["1 smtp.google.com."]
    }
    "okuvu.in-TXT" = {
      name    = "okuvu.in"
      type    = "TXT"
      ttl     = 1800
      records = ["v=spf1 include:_spf.google.com ~all"]
    }
    "_dmarc.okuvu.in-TXT" = {
      name    = "_dmarc.okuvu.in"
      type    = "TXT"
      ttl     = 1800
      records = ["v=DMARC1; p=none; rua=mailto:admin@okuvu.in"]
    }
    "google._domainkey.okuvu.in-TXT" = {
      name    = "google._domainkey.okuvu.in"
      type    = "TXT"
      ttl     = 1800
      records = ["v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAiTp4X8XwibZvFIQ0hs4I5aA2CGO8+BsHtfn1ySjPgGW1CLdxjXcvt+VLbgFuAGYSAxHgLN1ohJhIrVqMAXUL+dBmLlrEvrVL/YY/WNCR2SZ02kXoa+tb3NtZJUeGGHDm+3zq70OSv83CpvQA/aPZ8zpgjyioJYqUVPaH65z1j+ES39hnyvEB7jzPHhRISJe+k\" \"s4pcNlE5eJhqgWhlV6eo4rof2jpNWeO0uqQE/uwFE4Wx2KFpD/CvHHaJLhn8UNP8hBRS+2WZNvxSiIPFTaDwLSMihx1cfoZI9bs6iaAqSI+lDG+p2ZNkzv5uCiH9bioV/4iU2VOKS/rdty99lQqrwIDAQAB"]
    }
  }
}

resource "aws_route53_record" "mail" {
  for_each = var.manage_dns ? local.mail_records : {}

  zone_id = aws_route53_zone.main[0].zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = each.value.ttl
  records = each.value.records

  allow_overwrite = false
}
