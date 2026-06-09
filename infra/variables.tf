variable "project_id" {
  description = "The Google Cloud Project ID to deploy resources into."
  type        = string
}

variable "region" {
  description = "The GCP region to deploy resources (Singapore is highly recommended for low latency in Malaysia)."
  type        = string
  default     = "asia-southeast1"
}

variable "repository_name" {
  description = "The Artifact Registry repository name."
  type        = string
  default     = "mursyid-repo"
}

variable "service_name" {
  description = "The name of the Cloud Run service."
  type        = string
  default     = "mursyid-ai"
}

variable "postgres_db_password" {
  description = "The password for the PostgreSQL database administrator user."
  type        = string
  sensitive   = true
}
