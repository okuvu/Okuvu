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

variable "alarm_notification_email" {
  description = "Optional email subscribed to operational alarms (leave empty to skip)"
  type        = string
  default     = ""
}

variable "portal_callback_urls" {
  description = "NextAuth OAuth callback URLs registered on the therapist Cognito app client"
  type        = list(string)
  default     = ["http://localhost:3001/api/auth/callback/cognito"]
}

variable "portal_logout_urls" {
  description = "Post-sign-out redirect URLs registered on the therapist Cognito app client"
  type        = list(string)
  default     = ["http://localhost:3001/auth"]
}

variable "bedrock_model_id" {
  description = "Bedrock model id for every pipeline LLM call (in-region only)"
  type        = string
  default     = "amazon.nova-pro-v1:0"
}

variable "bedrock_embedding_model_id" {
  description = "Bedrock embedding model id; must emit the 768 dims the pgvector column pins"
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
}
