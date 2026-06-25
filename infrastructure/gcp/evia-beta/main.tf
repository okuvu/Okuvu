resource "google_project" "evia_beta" {
  name            = var.project_name
  project_id      = var.project_id
  billing_account = var.billing_account_id
  org_id          = var.organization_id

  labels = {
    environment = "beta"
    managed-by  = "terraform"
    project     = "evia"
  }
}

resource "google_project_service" "cloud_run" {
  project            = google_project.evia_beta.project_id
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloud_sql_admin" {
  project            = google_project.evia_beta.project_id
  service            = "sqladmin.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "firebase_auth" {
  project            = google_project.evia_beta.project_id
  service            = "identitytoolkit.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloud_storage" {
  project            = google_project.evia_beta.project_id
  service            = "storage.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "vertex_ai" {
  project            = google_project.evia_beta.project_id
  service            = "aiplatform.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "secret_manager" {
  project            = google_project.evia_beta.project_id
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false
}

resource "google_service_account" "evia_beta_sa" {
  project      = google_project.evia_beta.project_id
  account_id   = var.service_account_id
  display_name = var.service_account_name
  description  = "Least-privilege service account for evia services. NOT granted Owner or Editor."
}

resource "google_project_iam_member" "sa_cloud_sql_client" {
  project = google_project.evia_beta.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.evia_beta_sa.email}"
}

resource "google_project_iam_member" "sa_secret_manager_accessor" {
  project = google_project.evia_beta.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.evia_beta_sa.email}"
}

resource "google_project_iam_member" "sa_vertex_ai_user" {
  project = google_project.evia_beta.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.evia_beta_sa.email}"
}

resource "google_project_iam_member" "sa_storage_object_admin" {
  project = google_project.evia_beta.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.evia_beta_sa.email}"
}

resource "google_project_iam_member" "admin_owner" {
  project = google_project.evia_beta.project_id
  role    = "roles/owner"
  member  = "user:${var.admin_user}"
}
