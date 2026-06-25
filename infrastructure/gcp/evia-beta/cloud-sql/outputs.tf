output "cloud_sql_instance_name" {
  description = "Name of the Cloud SQL instance"
  value       = google_sql_database_instance.evia.name
}

output "cloud_sql_connection_name" {
  description = "Connection name for Cloud SQL Proxy"
  value       = google_sql_database_instance.evia.connection_name
}

output "cloud_sql_public_ip" {
  description = "Public IP of the Cloud SQL instance"
  value       = google_sql_database_instance.evia.public_ip_address
}

output "database_name" {
  description = "Database name"
  value       = google_sql_database.evia.name
}

output "database_user" {
  description = "Database user"
  value       = google_sql_user.evia_app.name
}

output "database_url_secret_id" {
  description = "Secret Manager secret ID for DATABASE_URL"
  value       = google_secret_manager_secret.database_url.secret_id
}

output "sarvam_api_key_secret_id" {
  description = "Secret Manager secret ID for SARVAM_API_KEY"
  value       = google_secret_manager_secret.sarvam_api_key.secret_id
}

output "google_application_credentials_secret_id" {
  description = "Secret Manager secret ID for GOOGLE_APPLICATION_CREDENTIALS"
  value       = google_secret_manager_secret.google_application_credentials.secret_id
}
