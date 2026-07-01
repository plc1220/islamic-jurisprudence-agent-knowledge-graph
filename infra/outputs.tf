output "cloud_run_url" {
  description = "The public URL of the deployed Cloud Run Mursyid AI service."
  value       = try(google_cloud_run_service.mursyid_app[0].status[0].url, null)
}

output "artifact_registry_repo" {
  description = "The repository URL in Artifact Registry."
  value       = google_artifact_registry_repository.repo.id
}

output "cloud_run_runtime_service_account" {
  description = "Service account for Cloud Run runtime and Cloud Build deployment impersonation."
  value       = google_service_account.cloud_run_runtime.email
}

output "gcs_raw_bucket" {
  description = "Cloud Storage bucket for raw markdown snapshots."
  value       = google_storage_bucket.raw_markdown.name
}

output "bigquery_dataset" {
  description = "BigQuery dataset for corpus, chunk, and graph tables."
  value       = google_bigquery_dataset.knowledge.dataset_id
}

output "memorystore_redis_host" {
  description = "Private Redis host for Memorystore shared cache."
  value       = try(google_redis_instance.cache[0].host, null)
}

output "memorystore_redis_port" {
  description = "Private Redis port for Memorystore shared cache."
  value       = try(google_redis_instance.cache[0].port, null)
}

output "memorystore_instance_id" {
  description = "Memorystore Redis instance resource ID."
  value       = try(google_redis_instance.cache[0].id, null)
}

output "serverless_vpc_connector" {
  description = "Serverless VPC Access connector used by Cloud Run to reach Memorystore."
  value       = try(google_vpc_access_connector.memorystore[0].id, null)
}

output "cache_vpc_network" {
  description = "VPC network used for Cloud Run to Memorystore cache traffic."
  value       = try(google_compute_network.cache[0].id, null)
}

output "github_actions_deploy_service_account" {
  description = "Service account GitHub Actions should impersonate for deployments."
  value       = google_service_account.github_deployer.email
}

output "github_actions_workload_identity_provider" {
  description = "Workload Identity Provider resource name for GitHub Actions OIDC."
  value       = google_iam_workload_identity_pool_provider.github.name
}
