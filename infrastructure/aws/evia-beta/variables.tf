variable "aws_region" {
  description = "AWS region for all resources. Must stay in ap-south-1 (Mumbai) for DPDP data residency."
  type        = string
  default     = "ap-south-1"

  validation {
    condition     = var.aws_region == "ap-south-1"
    error_message = "All resources must live in ap-south-1 for DPDP 2026 data residency."
  }
}

variable "project" {
  description = "Project tag applied to every resource"
  type        = string
  default     = "okuvu"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "beta"

  validation {
    condition     = contains(["beta", "staging", "prod"], var.environment)
    error_message = "environment must be one of: beta, staging, prod."
  }
}

variable "name_prefix" {
  description = "Prefix for every resource name"
  type        = string
  default     = "evia-beta"
}

variable "availability_zones" {
  description = "Two AZs used by both subnets and the ALB/RDS subnet groups"
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]

  validation {
    condition     = length(var.availability_zones) == 2
    error_message = "Exactly two availability zones are required (ALB and RDS both need two)."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDRs for the two public subnets, index-aligned with availability_zones"
  type        = list(string)
  default     = ["10.20.0.0/24", "10.20.1.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) == 2
    error_message = "Provide exactly two public subnet CIDRs."
  }
}

variable "private_subnet_cidrs" {
  description = "CIDRs for the two private subnets, index-aligned with availability_zones"
  type        = list(string)
  default     = ["10.20.10.0/24", "10.20.11.0/24"]

  validation {
    condition     = length(var.private_subnet_cidrs) == 2
    error_message = "Provide exactly two private subnet CIDRs."
  }
}

variable "db_name" {
  description = "Initial database name"
  type        = string
  default     = "evia"
}

variable "db_user" {
  description = "Master username for RDS"
  type        = string
  default     = "evia_app"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.small"
}

variable "db_engine_version" {
  description = "PostgreSQL major version"
  type        = string
  default     = "16"
}

variable "db_allocated_storage_gb" {
  description = "Allocated storage in GiB"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage_gb" {
  description = "Storage autoscaling ceiling in GiB"
  type        = number
  default     = 100
}

variable "db_multi_az" {
  description = "Run RDS in Multi-AZ (off for beta to keep cost down)"
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  description = "Automated backup retention in days"
  type        = number
  default     = 7
}

variable "db_deletion_protection" {
  description = "Block accidental deletion of the database"
  type        = bool
  default     = true
}

variable "db_apply_immediately" {
  description = "Apply DB modifications now instead of in the maintenance window. A class change reboots the instance, so leave false when users exist."
  type        = bool
  default     = false
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_num_nodes" {
  description = "Number of cache nodes (1 for beta; failover requires 2+)"
  type        = number
  default     = 1
}

variable "redis_engine_version" {
  description = "Valkey engine version"
  type        = string
  default     = "7.2"
}

variable "redis_port" {
  description = "Port the cache listens on"
  type        = number
  default     = 6379
}

variable "image_tag" {
  description = "Container image tag deployed from ECR"
  type        = string
  default     = "latest"
}

variable "api_container_port" {
  description = "Port the api container listens on (apps/api defaults PORT to 8080)"
  type        = number
  default     = 8080
}

variable "cpu_architecture" {
  description = "Fargate CPU architecture; the images must be built for it (X86_64 matches existing CI builds, ARM64 is ~20% cheaper)"
  type        = string
  default     = "X86_64"

  validation {
    condition     = contains(["X86_64", "ARM64"], var.cpu_architecture)
    error_message = "cpu_architecture must be X86_64 or ARM64."
  }
}

variable "api_cpu" {
  description = "Fargate CPU units for the api task"
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Fargate memory (MiB) for the api task"
  type        = number
  default     = 1024
}

variable "api_desired_count" {
  description = "Number of api tasks"
  type        = number
  default     = 2
}

variable "worker_cpu" {
  description = "Fargate CPU units for the worker task"
  type        = number
  default     = 512
}

variable "worker_memory" {
  description = "Fargate memory (MiB) for the worker task"
  type        = number
  default     = 1024
}

variable "worker_desired_count" {
  description = "Number of worker tasks"
  type        = number
  default     = 1
}

variable "health_check_path" {
  description = "HTTP path the ALB target group polls"
  type        = string
  default     = "/health"
}

variable "alb_certificate_arn" {
  description = "ACM certificate ARN; when set an HTTPS:443 listener is created alongside HTTP:80"
  type        = string
  default     = ""

  validation {
    condition     = var.alb_certificate_arn == "" || can(regex("^arn:aws:acm:", var.alb_certificate_arn))
    error_message = "alb_certificate_arn must be empty or an ACM certificate ARN."
  }
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for ECS and flow logs"
  type        = number
  default     = 14
}

variable "monthly_budget_limit_usd" {
  description = "Monthly AWS spend ceiling that triggers the budget alarm"
  type        = number
  default     = 150
}

variable "budget_notification_email" {
  description = "Optional email subscribed to budget alarms (leave empty to skip)"
  type        = string
  default     = ""
}

variable "rds_free_storage_alarm_gb" {
  description = "FreeStorageSpace threshold (GiB) below which the RDS alarm fires"
  type        = number
  default     = 5
}

variable "rds_max_connections_alarm" {
  description = "DatabaseConnections threshold above which the RDS alarm fires (max_connections is 100)"
  type        = number
  default     = 80
}

variable "alb_access_log_retention_days" {
  description = "How long ALB access logs are kept in S3 before lifecycle expiry"
  type        = number
  default     = 90
}

variable "alarm_notification_email" {
  description = "Optional email subscribed to operational alarms (leave empty to skip)"
  type        = string
  default     = ""
}

variable "portal_callback_urls" {
  description = "Extra NextAuth OAuth callback URLs registered on the therapist Cognito app client, on top of the ones derived from portal_hostname and portal_alias_hostnames (default: local development)"
  type        = list(string)
  default     = ["http://localhost:3001/api/auth/callback/cognito"]
}

variable "portal_logout_urls" {
  description = "Extra post-sign-out redirect URLs registered on the therapist Cognito app client, on top of the ones derived from portal_hostname and portal_alias_hostnames (default: local development)"
  type        = list(string)
  default     = ["http://localhost:3001/auth"]
}

variable "portal_alias_hostnames" {
  description = "Additional public hostnames the therapist portal answers on (apex and www). Each one gets an ALB host rule and a registered Cognito callback, so sign-in completes on whichever host the therapist typed."
  type        = list(string)
  default     = ["okuvu.in", "www.okuvu.in"]
}

variable "portal_nextauth_url" {
  description = "Pin NextAuth to one canonical origin (e.g. https://okuvu.in). Empty (default) derives the origin from the request Host, which is what lets a single deployment serve sign-in on every hostname in portal_alias_hostnames."
  type        = string
  default     = ""

  validation {
    condition     = var.portal_nextauth_url == "" || can(regex("^https://[a-z0-9.-]+$", var.portal_nextauth_url))
    error_message = "portal_nextauth_url must be empty or an https origin with no path or trailing slash."
  }
}

variable "cognito_therapist_domain_prefix" {
  description = "Cognito prefix domain for the therapist pool (becomes <prefix>.auth.<region>.amazoncognito.com). The OAuth authorize/token endpoints the portal needs exist only once a domain is attached. Prefixes are globally unique per region; if apply reports the prefix is taken, change this value (e.g. okuvu-therapists-auth)."
  type        = string
  default     = "okuvu-therapists"

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", var.cognito_therapist_domain_prefix))
    error_message = "cognito_therapist_domain_prefix must be lowercase alphanumeric or hyphen, 1-63 characters."
  }
}

# -----------------------------------------------------------------------------
# Therapist portal (portal.tf)
# -----------------------------------------------------------------------------

variable "portal_container_port" {
  description = "Port the portal container listens on (Next.js `next start`)"
  type        = number
  default     = 3000
}

variable "portal_cpu" {
  description = "Fargate CPU units for the portal task"
  type        = number
  default     = 512
}

variable "portal_memory" {
  description = "Fargate memory (MiB) for the portal task"
  type        = number
  default     = 1024
}

variable "portal_desired_count" {
  description = "Number of portal tasks"
  type        = number
  default     = 2
}

variable "portal_hostname" {
  description = "Public hostname the therapist portal is served on (must be in the ACM certificate)"
  type        = string
  default     = "portal.okuvu.in"
}

variable "admin_emails" {
  description = "Comma-separated therapist emails allowed into /admin. Empty disables the admin console (audit F-07)."
  type        = string
  default     = ""
}

variable "brevo_from_email" {
  description = "From address on invite emails sent by the Add-Client wizard"
  type        = string
  default     = "noreply@okuvu.in"
}

variable "brevo_from_name" {
  description = "From name on invite emails"
  type        = string
  default     = "OKUVU"
}

variable "brevo_api_key" {
  description = "Brevo API key stored in Secrets Manager for the portal invite flow. Empty leaves invite emails disabled (code shown on screen instead)."
  type        = string
  default     = ""
  sensitive   = true
}

# -----------------------------------------------------------------------------
# DNS + TLS (dns.tf) — Cloud Run used to hand out *.a.run.app hostnames and
# Google-managed certificates, so none of this existed before the cutover.
# -----------------------------------------------------------------------------

variable "dns_zone_name" {
  description = "Public zone created in Route53 for the app + portal hostnames"
  type        = string
  default     = "okuvu.in"
}

variable "manage_dns" {
  description = "Create the Route53 zone, ACM certificate and alias records. Set false to supply alb_certificate_arn and manage DNS elsewhere."
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# Build pipeline (pipeline.tf)
# -----------------------------------------------------------------------------

variable "codestar_connection_arn" {
  description = "CodeStar (CodeConnections) GitHub connection ARN. Empty leaves the CodeBuild project uncreated, because the OAuth handshake cannot be automated."
  type        = string
  default     = ""

  validation {
    condition     = var.codestar_connection_arn == "" || can(regex("^arn:aws:codeconnections:", var.codestar_connection_arn))
    error_message = "codestar_connection_arn must be empty or a CodeConnections connection ARN."
  }
}

variable "github_repository" {
  description = "owner/repo the CodeBuild project builds from"
  type        = string
  default     = "yashraj-ops/Okuvu"
}

variable "codebuild_compute_type" {
  description = "CodeBuild compute size; MEDIUM is the smallest that reliably runs the pnpm install + three image builds"
  type        = string
  default     = "BUILD_GENERAL1_MEDIUM"
}

variable "enable_webhook" {
  description = "Create the CodeBuild GitHub webhook that starts a build on every push to develop. false leaves the project intact but removes the push trigger."
  type        = bool
  default     = true
}

variable "bedrock_model_id" {
  description = "Bedrock model id for every pipeline LLM call (in-region only)"
  type        = string
  default     = "qwen.qwen3-32b-v1:0"
}

variable "bedrock_embedding_model_id" {
  description = "Bedrock embedding model id; must emit the 768 dims the pgvector column pins"
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
}
