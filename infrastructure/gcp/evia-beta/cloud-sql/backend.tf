terraform {
  backend "gcs" {
    bucket = "evia-beta-terraform-state"
    prefix = "cloud-sql"
  }
}
