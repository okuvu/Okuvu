variable "gcp_region" {
  description = "GCP region for all resources"
  type        = string
  default     = "asia-south1"
}

variable "billing_account_id" {
  description = "GCP billing account ID (format: XXXXXX-XXXXXX-XXXXXX)"
  type        = string
  sensitive   = true
}

variable "organization_id" {
  description = "GCP organization ID (numeric)"
  type        = string
}

variable "project_name" {
  description = "Display name for the GCP project"
  type        = string
  default     = "Evia"
}

variable "project_id" {
  description = "Globally unique GCP project ID"
  type        = string
  default     = "evia-500215"
}

variable "admin_user" {
  description = "Email of the user who will own the project (IAM owner at project level)"
  type        = string
}

variable "service_account_name" {
  description = "Display name for the dedicated service account"
  type        = string
  default     = "evia-sa"
}

variable "service_account_id" {
  description = "Unique ID for the service account (must be 6-30 chars, lowercase alphanumeric)"
  type        = string
  default     = "evia-sa"
}
