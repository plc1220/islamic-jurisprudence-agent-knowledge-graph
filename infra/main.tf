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

locals {
  gcs_raw_bucket_name = var.gcs_raw_bucket_name != "" ? var.gcs_raw_bucket_name : "${var.project_id}-mursyid-raw"
}

data "google_project" "current" {
  project_id = var.project_id
}

# ==============================================================================
# 1. Enable Required GCP Service APIs
# ==============================================================================
resource "google_project_service" "apis" {
  for_each = toset([
    "aiplatform.googleapis.com",
    "bigquery.googleapis.com",
    "bigqueryconnection.googleapis.com",
    "dataplex.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "iamcredentials.googleapis.com",
    "storage.googleapis.com"
  ])
  service            = each.key
  disable_on_destroy = false
}

# ==============================================================================
# 2. Cloud Run Runtime Identity
# ==============================================================================
resource "google_service_account" "cloud_run_runtime" {
  account_id   = "mursyid-runtime"
  display_name = "Mursyid AI Cloud Run runtime"
  depends_on   = [google_project_service.apis]
}

resource "google_project_iam_member" "runtime_roles" {
  for_each = toset([
    "roles/aiplatform.user",
    "roles/bigquery.dataEditor",
    "roles/bigquery.jobUser",
    "roles/dataplex.catalogEditor",
    "roles/storage.objectAdmin",
  ])

  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.cloud_run_runtime.email}"
}

resource "google_project_iam_member" "cloud_build_roles" {
  for_each = toset([
    "roles/artifactregistry.writer",
    "roles/run.admin",
  ])

  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${data.google_project.current.number}@cloudbuild.gserviceaccount.com"
}

resource "google_service_account_iam_member" "cloud_build_runtime_act_as" {
  service_account_id = google_service_account.cloud_run_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${data.google_project.current.number}@cloudbuild.gserviceaccount.com"
}

# ==============================================================================
# 2b. GitHub Actions Deployment Identity
# ==============================================================================
resource "google_service_account" "github_deployer" {
  account_id   = "mursyid-github-deployer"
  display_name = "Mursyid AI GitHub Actions deployer"
  depends_on   = [google_project_service.apis]
}

resource "google_project_iam_member" "github_deployer_roles" {
  for_each = toset([
    "roles/artifactregistry.writer",
    "roles/run.admin",
  ])

  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.github_deployer.email}"
}

resource "google_service_account_iam_member" "github_deployer_runtime_act_as" {
  service_account_id = google_service_account.cloud_run_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deployer.email}"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  description               = "OIDC identity pool for GitHub Actions deployments."
  depends_on                = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub OIDC"
  description                        = "Accepts GitHub Actions OIDC tokens for the configured repository."

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  attribute_condition = "assertion.repository == '${var.github_repository}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_deployer_wif_user" {
  service_account_id = google_service_account.github_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_service_account_iam_member" "github_deployer_token_creator" {
  service_account_id = google_service_account.github_deployer.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# ==============================================================================
# 3. BigQuery + Cloud Storage Native Knowledge Stores
# ==============================================================================
resource "google_bigquery_dataset" "knowledge" {
  dataset_id                 = var.bq_dataset
  friendly_name              = "Mursyid Knowledge"
  description                = "Corpus, chunk embeddings, and graph edges for Mursyid AI."
  location                   = var.region
  delete_contents_on_destroy = false
  depends_on                 = [google_project_service.apis]
}

resource "google_storage_bucket" "raw_markdown" {
  name                        = local.gcs_raw_bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false
  depends_on                  = [google_project_service.apis]
}

# ==============================================================================
# 4. Artifact Registry Repository
# ==============================================================================
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = var.repository_name
  description   = "Docker Repository for Mursyid AI images"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

# ==============================================================================
# 5. Cloud Run Application Service
# ==============================================================================
resource "google_cloud_run_service" "mursyid_app" {
  count = var.deploy_cloud_run ? 1 : 0

  name     = var.service_name
  location = var.region

  template {
    spec {
      service_account_name = google_service_account.cloud_run_runtime.email

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
          name  = "GOOGLE_GENAI_USE_ENTERPRISE"
          value = "true"
        }
        env {
          name  = "GOOGLE_GENAI_USE_VERTEXAI"
          value = "true"
        }
        env {
          name  = "GCP_PROJECT_ID"
          value = var.project_id
        }
        env {
          name  = "GCP_LOCATION"
          value = var.region
        }
        env {
          name  = "GOOGLE_CLOUD_PROJECT"
          value = var.project_id
        }
        env {
          name  = "GOOGLE_CLOUD_LOCATION"
          value = var.gemini_location
        }
        env {
          name  = "GEMINI_LOCATION"
          value = var.gemini_location
        }
        env {
          name  = "BQ_DATASET"
          value = google_bigquery_dataset.knowledge.dataset_id
        }
        env {
          name  = "BQ_CORPUS_TABLE"
          value = var.bq_corpus_table
        }
        env {
          name  = "BQ_CHUNKS_TABLE"
          value = var.bq_chunks_table
        }
        env {
          name  = "BQ_GRAPH_TABLE"
          value = var.bq_graph_table
        }
        env {
          name  = "BQ_CRAWL_RUNS_TABLE"
          value = var.bq_crawl_runs_table
        }
        env {
          name  = "BQ_EMBEDDING_MODEL"
          value = var.bq_embedding_model
        }
        env {
          name  = "GCS_RAW_BUCKET"
          value = google_storage_bucket.raw_markdown.name
        }
        env {
          name  = "KNOWLEDGE_CATALOG_ENTRY_GROUP"
          value = var.knowledge_catalog_entry_group
        }
        env {
          name  = "KNOWLEDGE_CATALOG_ENTRY_TYPE"
          value = var.knowledge_catalog_entry_type
        }
        env {
          name  = "KNOWLEDGE_CATALOG_ASPECT_TYPE"
          value = var.knowledge_catalog_aspect_type
        }
        env {
          name  = "MDCODE_EXPORT_DIR"
          value = "/tmp/catalog-export"
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [
    google_bigquery_dataset.knowledge,
    google_storage_bucket.raw_markdown,
    google_project_iam_member.runtime_roles
  ]
}

# Make the Cloud Run service publicly accessible over the internet
resource "google_cloud_run_service_iam_member" "noauth" {
  count = var.deploy_cloud_run ? 1 : 0

  location = google_cloud_run_service.mursyid_app[0].location
  project  = google_cloud_run_service.mursyid_app[0].project
  service  = google_cloud_run_service.mursyid_app[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
