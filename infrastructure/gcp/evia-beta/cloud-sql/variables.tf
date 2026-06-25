variable "project_id" {
  description = "GCP project ID (evia-500215)"
  type        = string
  default     = "evia-500215"
}

variable "region" {
  description = "GCP region — must be asia-south1 for DPDP 2026 compliance"
  type        = string
  default     = "asia-south1"
}

variable "db_tier" {
  description = "Cloud SQL instance tier"
  type        = string
  default     = "db-custom-1-3840"
}

variable "db_version" {
  description = "Cloud SQL database version"
  type        = string
  default     = "POSTGRES_15"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "evia"
}

variable "db_user" {
  description = "Default database user"
  type        = string
  default     = "evia_app"
}

variable "db_backup_retention_days" {
  description = "Number of days to retain automated backups"
  type        = number
  default     = 7
}

variable "cloud_run_service_account" {
  description = "Email of the Cloud Run service account that needs secret access"
  type        = string
  default     = "evia-sa@evia-500215.iam.gserviceaccount.com"
}

variable "sarvam_api_key" {
  description = "Sarvam API key (placeholder until contract signed)"
  type        = string
  sensitive   = true
}

variable "gcp_service_account_key" {
  description = "GCP service account key JSON for GOOGLE_APPLICATION_CREDENTIALS (populated manually post-E0-S05)"
  type        = string
  sensitive   = true
  default     = "{}"
}
