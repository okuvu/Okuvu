resource "random_password" "db_password" {
  length  = 24
  special = false
}

resource "google_sql_database_instance" "evia" {
  name             = "evia-db"
  database_version = var.db_version
  region           = var.region

  settings {
    tier              = var.db_tier
    disk_size         = 10
    disk_type         = "PD_SSD"
    disk_autoresize   = true
    disk_autoresize_limit = 100

    availability_type = "ZONAL"

    backup_configuration {
      enabled                        = true
      start_time                     = "02:00"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = var.db_backup_retention_days
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled    = true
      require_ssl     = true
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = false
      record_client_address   = false
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }
  }

  deletion_protection = true
}

resource "google_sql_database" "evia" {
  name     = var.db_name
  instance = google_sql_database_instance.evia.name
}

resource "google_sql_user" "evia_app" {
  name     = var.db_user
  instance = google_sql_database_instance.evia.name
  password = random_password.db_password.result
}
