resource "google_secret_manager_secret" "database_url" {
  secret_id = "DATABASE_URL"

  replication {
    auto {}
  }

  labels = {
    managed-by = "terraform"
    story      = "E0-S06"
  }
}

resource "google_secret_manager_secret" "sarvam_api_key" {
  secret_id = "SARVAM_API_KEY"

  replication {
    auto {}
  }

  labels = {
    managed-by = "terraform"
    story      = "E0-S06"
  }
}

resource "google_secret_manager_secret" "google_application_credentials" {
  secret_id = "GOOGLE_APPLICATION_CREDENTIALS"

  replication {
    auto {}
  }

  labels = {
    managed-by = "terraform"
    story      = "E0-S06"
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgresql://${var.db_user}:${urlencode(random_password.db_password.result)}@${google_sql_database_instance.evia.public_ip_address}:5432/${var.db_name}?sslmode=require"
}

resource "google_secret_manager_secret_version" "sarvam_api_key" {
  secret      = google_secret_manager_secret.sarvam_api_key.id
  secret_data = var.sarvam_api_key
}

resource "google_secret_manager_secret_version" "google_application_credentials" {
  secret      = google_secret_manager_secret.google_application_credentials.id
  secret_data = var.gcp_service_account_key
}

resource "google_secret_manager_secret_iam_member" "database_url_access" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.cloud_run_service_account}"
}

resource "google_secret_manager_secret_iam_member" "sarvam_api_key_access" {
  secret_id = google_secret_manager_secret.sarvam_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.cloud_run_service_account}"
}

resource "google_secret_manager_secret_iam_member" "google_application_credentials_access" {
  secret_id = google_secret_manager_secret.google_application_credentials.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.cloud_run_service_account}"
}
