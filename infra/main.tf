terraform {
  required_version = ">= 1.3.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ==============================================================================
# 1. Enable Required GCP Service APIs
# ==============================================================================
resource "google_project_service" "apis" {
  for_each = toset([
    "compute.googleapis.com",
    "vpcaccess.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com"
  ])
  service            = each.key
  disable_on_destroy = false
}

# ==============================================================================
# 2. VPC Network & Networking Subsystems
# ==============================================================================
resource "google_compute_network" "vpc_network" {
  name                    = "mursyid-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "vpc_subnet" {
  name          = "mursyid-subnet"
  ip_cidr_range = "10.0.0.0/24"
  network       = google_compute_network.vpc_network.id
  region        = var.region
}

# Serverless VPC Access Connector for private Serverless-to-VPC routing
resource "google_vpc_access_connector" "vpc_connector" {
  name          = "mursyid-vpc-conn"
  region        = var.region
  ip_cidr_range = "10.8.0.0/28" # Dedicated IP block for connector VMs
  network       = google_compute_network.vpc_network.name
  depends_on    = [google_project_service.apis]
}

# Private Service Connection (needed to assign private IPs to Cloud SQL & Redis)
resource "google_compute_global_address" "private_ip_alloc" {
  name          = "mursyid-private-ip-alloc"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc_network.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc_network.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc.name]
}

# ==============================================================================
# 3. Cloud SQL (PostgreSQL with pgvector capability)
# ==============================================================================
resource "google_sql_database_instance" "postgres" {
  name             = "mursyid-postgres-db"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier = "db-f1-micro" # Highly affordable dev tier. Upgrade to db-g1-small or custom for production.
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc_network.id
    }
  }

  depends_on = [google_service_networking_connection.private_vpc_connection]
}

resource "google_sql_user" "postgres_admin" {
  name     = "mursyid_admin"
  instance = google_sql_database_instance.postgres.name
  password = var.postgres_db_password
}

resource "google_sql_database" "mursyid_db" {
  name     = "mursyid_knowledge"
  instance = google_sql_database_instance.postgres.name
}

# ==============================================================================
# 4. Cloud Memorystore for Redis (Caching Database Layer)
# ==============================================================================
resource "google_redis_instance" "cache_redis" {
  name               = "mursyid-cache-redis"
  tier               = "BASIC"
  memory_size_gb     = 1
  region             = var.region
  authorized_network = google_compute_network.vpc_network.id

  # Connects directly to the private network
  connect_mode = "PRIVATE_SERVICE_ACCESS"

  depends_on = [google_service_networking_connection.private_vpc_connection]
}

# ==============================================================================
# 5. Secret Manager Configuration
# ==============================================================================
resource "google_secret_manager_secret" "gemini_api_key" {
  secret_id = "GEMINI_API_KEY"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# ==============================================================================
# 6. Artifact Registry Repository
# ==============================================================================
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = var.repository_name
  description   = "Docker Repository for Mursyid AI images"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

# ==============================================================================
# 7. Cloud Run Application Service
# ==============================================================================
resource "google_cloud_run_service" "mursyid_app" {
  name     = var.service_name
  location = var.region

  template {
    spec {
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.repository_name}/${var.service_name}:latest"
        ports {
          container_port = 3000
        }

        # Environment variables configured privately
        env {
          name  = "NODE_ENV"
          value = "production"
        }
        env {
          name  = "PORT"
          value = "3000"
        }
        env {
          name  = "DB_HOST"
          value = google_sql_database_instance.postgres.private_ip_address
        }
        env {
          name  = "DB_USER"
          value = google_sql_user.postgres_admin.name
        }
        env {
          name  = "DB_NAME"
          value = google_sql_database.mursyid_db.name
        }
        env {
          name  = "REDIS_HOST"
          value = google_redis_instance.cache_redis.host
        }
        env {
          name  = "REDIS_PORT"
          value = tostring(google_redis_instance.cache_redis.port)
        }

        # Safe secrets bindings
        env {
          name = "GEMINI_API_KEY"
          value_from {
            secret_key_ref {
              name = google_secret_manager_secret.gemini_api_key.secret_id
              key  = "latest"
            }
          }
        }
        env {
          name  = "DB_PASSWORD"
          value = var.postgres_db_password
        }
      }
    }

    metadata {
      annotations = {
        # Secure serverless network interface
        "run.googleapis.com/vpc-access-connector" = google_vpc_access_connector.vpc_connector.name
        "run.googleapis.com/vpc-access-egress"    = "all-traffic"
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [
    google_sql_database_instance.postgres,
    google_redis_instance.cache_redis,
    google_vpc_access_connector.vpc_connector
  ]
}

# Make the Cloud Run service publicly accessible over the internet
resource "google_cloud_run_service_iam_member" "noauth" {
  location = google_cloud_run_service.mursyid_app.location
  project  = google_cloud_run_service.mursyid_app.project
  service  = google_cloud_run_service.mursyid_app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
