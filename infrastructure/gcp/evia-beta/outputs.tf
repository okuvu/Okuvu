output "project_id" {
  description = "The evia GCP project ID"
  value       = google_project.evia_beta.project_id
}

output "project_number" {
  description = "The evia GCP project number"
  value       = google_project.evia_beta.number
}

output "service_account_email" {
  description = "Email of the dedicated least-privilege service account"
  value       = google_service_account.evia_beta_sa.email
}

output "service_account_id" {
  description = "ID of the dedicated service account"
  value       = google_service_account.evia_beta_sa.account_id
}

output "enabled_apis" {
  description = "List of enabled API services"
  value = [
    google_project_service.cloud_run.service,
    google_project_service.cloud_sql_admin.service,
    google_project_service.firebase_auth.service,
    google_project_service.cloud_storage.service,
    google_project_service.vertex_ai.service,
    google_project_service.secret_manager.service,
  ]
}
